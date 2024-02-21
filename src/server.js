const path = require("path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const EventEmitter = require("events");
require("dotenv").config();

class GRPCServerStream extends EventEmitter {
  static #server;
  #uniqueIdPath;

  constructor(protoName, uniqueIdPath, rpcName) {
    super();

    GRPCServerStream.#validateAttributes({ protoName, uniqueIdPath, rpcName });

    const protoPath = path.resolve(
      __dirname,
      "protocol-buffers",
      `${protoName}.proto`
    );

    if (!GRPCServerStream.#server) {
      GRPCServerStream.#server = new grpc.Server();
      GRPCServerStream.#startServer();
    }

    this.#uniqueIdPath = uniqueIdPath;

    const packageDefinition = protoLoader.loadSync(protoPath);
    const proto = grpc.loadPackageDefinition(packageDefinition);

    GRPCServerStream.#server.addService(proto.StreamService.service, {
      [rpcName]: this.#streamingRPC.bind(this),
    });
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

  static #startServer() {
    const ipAddress = process.env.GRPC_SERVER_IP;
    const port = process.env.GRPC_SERVER_PORT;

    if (!GRPCServerStream.#server.bound) {
      GRPCServerStream.#server.bindAsync(
        `${ipAddress}:${port}`,
        grpc.ServerCredentials.createInsecure(),
        () => {
          console.log(`Server running on ${ipAddress}:${port}`);
          GRPCServerStream.#server;
        }
      );
    }
  }

  static #getMessageId(message, uniqueIdPath) {
    try {
      const keys = uniqueIdPath.split(".");
      let result = message;

      for (const k of keys) {
        if (result && typeof result === "object" && k in result) {
          result = result[k];
        } else {
          return null;
        }
      }

      return result;
    } catch (err) {
      console.log("GRPC Error: Error in get nested attribute!", { obj, key });
    }
  }

  #streamingRPC(stream) {
    console.log("GRPC client connected! Sending acknowledgment...");
    // Send an acknowledgment immediately upon connection
    stream.write({ connectionAck: { connected: true } });

    stream.on("data", (payload) => {
      try {
        const messageId = GRPCServerStream.#getMessageId(
          payload,
          this.#uniqueIdPath
        );

        this.emit("data", payload);

        // Send a message acknowledge message
        stream.write({ messageAck: { messageId } });
      } catch (err) {
        console.log("GRPC Error: ", { err });
      }
    });

    stream.on("end", () => {
      stream.end();
    });

    stream.on("error", (error) => {
      console.error("GRPC Error:", error);
    });

    stream.on("cancelled", () => {
      console.log("GRPC Error: Client cancelled the stream");
    });
  }
}

function runIt() {
  const stream1 = new GRPCServerStream(
    "message",
    "message.id",
    "MessageStreamingRPC"
  );
  const stream2 = new GRPCServerStream("task", "task.id", "TaskStreamingRPC");

  const stream3 = new GRPCServerStream(
    "event",
    "event.id",
    "EventStreamingRPC"
  );

  stream1.on("data", (payload) => {
    console.log("Got Message::", payload);
  });
  stream2.on("data", (payload) => {
    console.log("Got Task::", payload);
  });
  stream3.on("data", (payload) => {
    console.log("Got Event::", payload);
  });
}

runIt();
