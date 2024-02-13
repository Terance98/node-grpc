require("dotenv").config();
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

const PROTO_PATH = path.resolve(__dirname, "message.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const yourProto = grpc.loadPackageDefinition(packageDefinition);

class GRPCClientStream {
  #stream;
  #client;
  #dataHandler;
  #messageQueue = [];
  #isMessageQueueProcessing = false;
  #writtenMessageQueue = [];
  #isConnected = false;

  /**
   * Constructor for setting up a GRPC connection to the server.
   * @param {string} ip - The IP address of the GRPC server.
   * @param {number} port - The port number of the GRPC server.
   * @param {function} #dataHandler - Callback function to handle data received from the server.
   */
  constructor(ip, port, dataHandler) {
    this.#client = new yourProto.YourService(
      `${ip}:${port}`,
      grpc.credentials.createInsecure()
    );

    this.#dataHandler = dataHandler;
    this.#connect();
  }

  async #handleAcknowledgment(data) {
    const messageId = data.acknowledgeMessageId;
    console.log(`Acknowledged message: ${messageId}`);

    // Find the index of the message with the specified messageId
    const indexToRemove = this.#writtenMessageQueue.findIndex(
      (message) => message.id === messageId
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
      const stream = this.#client.YourStreamingRPC();

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
        if (data.text === "CONN_ACK") {
          resolve(stream);
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
    if (!this.#isConnected) return;

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
        this.#dataHandler(data);
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
  function onDataCallback(data) {
    console.log("GOT DATA: ", { data });
  }

  const serverPort = 4000;
  const ipAddress = "localhost";

  const grpcClient = new GRPCClientStream(
    ipAddress,
    serverPort,
    onDataCallback
  );

  let i = 0;
  setInterval(() => {
    const message = "Hello" + i++;
    grpcClient.writeData({ text: message, id: i });
  }, 1000);
}

runIt();
