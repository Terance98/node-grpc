require("dotenv").config();
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

class GRPCClientStream {
  #stream;
  #client;
  #messageQueue = [];
  #isMessageQueueProcessing = false;
  #writtenMessageQueue = [];
  #isConnected = false;
  #rpcName;
  #uniqueIdPath;

  /**
   * Constructor for setting up a GRPC connection to the server.
   * @param {string} ip - The IP address of the GRPC server.
   * @param {number} port - The port number of the GRPC server.
   * @param {function} dataHandler - Callback function to handle data received from the server.
   */
  constructor(protoName, uniqueIdPath, rpcName) {
    const ipAddress = process.env.IP_ADDRESS;
    const port = process.env.PORT;

    GRPCClientStream.#validateAttributes({ protoName, uniqueIdPath, rpcName });

    const protoPath = path.resolve(
      __dirname,
      "protocol-buffers",
      `${protoName}.proto`
    );
    const packageDefinition = protoLoader.loadSync(protoPath);
    const yourProto = grpc.loadPackageDefinition(packageDefinition);

    this.#client = new yourProto.StreamService(
      `${ipAddress}:${port}`,
      grpc.credentials.createInsecure()
    );

    this.#uniqueIdPath = uniqueIdPath;
    this.#rpcName = rpcName;

    this.#connect();
  }

  static #validateAttributes({ protoName, uniqueIdPath, rpcName }) {
    if (/[^a-zA-Z0-9_]/.test(protoName)) {
      throw new Error(
        "Invalid value for protoName! Cannot include special characters"
      );
    }

    if (/[^a-zA-Z.]/.test(uniqueIdPath)) {
      throw new Error(
        "Invalid value for uniqueIdPath! Only alphabets & '.'allowed!"
      );
    }

    if (/[^a-zA-Z0-9_]/.test(rpcName)) {
      throw new Error(
        "Invalid value for rpcName! Cannot include special characters"
      );
    }
  }

  #getNestedAttribute(obj, key) {
    const keys = key.split(".");
    let result = obj;

    for (const k of keys) {
      if (result && typeof result === "object" && k in result) {
        result = result[k];
      } else {
        return null;
      }
    }

    return result;
  }

  async #handleAcknowledgment({ messageAck }) {
    const messageId = messageAck.messageId;
    console.log(`Acknowledged message: ${messageId}`);

    // Find the index of the message with the specified messageId
    const indexToRemove = this.#writtenMessageQueue.findIndex(
      (message) =>
        this.#getNestedAttribute(message, this.#uniqueIdPath) == messageId
    );

    // Remove the acknowledged message from the array if found
    if (indexToRemove !== -1) {
      this.#writtenMessageQueue.splice(indexToRemove, 1);
    } else {
      console.warn(`Message with ID: ${messageId} not found in the array.`);
    }
  }

  /**
   * This function is responsible for trying to create a stream
   * If the stream successfully connects, then its returned
   * If the stream connection fails due to error, then its rejected
   * On rejection, the parent function again tries to create a new stream and establish the connection
   * @returns
   */
  async #createStream() {
    return new Promise((resolve, reject) => {
      const stream = this.#client[this.#rpcName]();

      stream.on("end", () => {
        this.#messageQueue.push(...this.#writtenMessageQueue);
        this.#writtenMessageQueue = [];
        this.#isMessageQueueProcessing = false;
        this.#isConnected = false;

        reject("Failed to establish connection with the server!");
      });

      stream.on("error", (err) => {
        reject("Connection to server errored!");
      });

      stream.on("data", (data) => {
        if (data?.connectionAck?.connected) {
          resolve(stream);
        } else {
          reject("Failed to acknowledge connection!");
        }
      });

      stream.on("close", (code, message) => {
        reject("Connection closed by the server!");
      });
    });
  }

  /**
   * This is the function that is exposed from the class
   * This function is responsible for pushing a new message to the message queue
   * And then triggering writing of the #messageQueue within message queue to the server
   * @param {*} message
   * @returns
   */
  writeData(message) {
    // Push the message to the message queue
    this.#messageQueue.push(message);

    // If the #client is not connected to the server, then return here so that we don't attempt writing
    if (!this.#isConnected) {
      console.log("Connection not present, caching & skipping message write!");
      return;
    }

    // Start writing #messageQueue to the server side
    this.#writeMessages();
  }

  /**
   * This function is responsible for initiating the message streaming to the backend
   * @returns
   */
  #writeMessages() {
    if (!this.#stream || this.#isMessageQueueProcessing) return;

    this.#isMessageQueueProcessing = true;
    this.#writeMessage();
    this.#isMessageQueueProcessing = false;
  }

  /**
   * This function is responsible for recursively writing a message to the server from the #messageQueue queue
   * Once the message is written, its pushed to the #writtenMessageQueue queue from where the #messageQueue are acknowledged later
   * @returns
   */
  #writeMessage() {
    const message = this.#messageQueue.shift();

    // Recursion ends when there are no more #messageQueue
    if (!message) return;

    this.#stream.write(message);
    this.#writtenMessageQueue.push(message);

    this.#writeMessage();
  }

  /**
   * This function is responsible for recursively trying to #connect to the server
   * Once the connection is established, it can start streaming #messageQueue to the server using its writeData function
   * The stream is then setup with two event listeners,
   * If the connection ends again, then the client recursively tries again to connect to the server
   * When we receive data(primarily acknowledgement of the data sent to the server), we process it as required
   */
  async #connect() {
    try {
      const stream = await this.#createStream();

      stream.on("end", () => {
        this.#connect();
      });

      stream.on("data", (data) => {
        this.#handleAcknowledgment(data);
      });

      console.log("Connection Successful!");

      this.#stream = stream;
      this.#isConnected = true;
      this.#writeMessages();
    } catch (err) {
      console.log("Connection Failed!", { err });
      setTimeout(() => this.#connect(), 2500);
    }
  }
}

async function runIt() {
  const grpcClient1 = new GRPCClientStream(
    "message",
    "message.id",
    "MessageStreamingRPC"
  );
  const grpcClient2 = new GRPCClientStream(
    "task",
    "task.id",
    "TaskStreamingRPC"
  );

  const grpcClient3 = new GRPCClientStream(
    "event",
    "event.id",
    "EventStreamingRPC"
  );

  let i = 0;
  setInterval(() => {
    const message = "Hello" + i++;

    const data1 = {
      message: {
        text: "yoyo!",
        id: i,
      },
    };

    const data2 = {
      task: {
        id: i,
        taskName: message,
      },
    };

    const data3 = {
      event: {
        id: i,
        eventName: "new event",
      },
    };

    grpcClient1.writeData(data1);
    grpcClient2.writeData(data2);
    grpcClient3.writeData(data3);
  }, 1000);
}

runIt();
