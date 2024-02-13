require("dotenv").config();
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

const PROTO_PATH = path.resolve(__dirname, "message.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const yourProto = grpc.loadPackageDefinition(packageDefinition);

const server = new grpc.Server();
const messageCount = { count: 0 };

server.addService(yourProto.YourService.service, {
  YourStreamingRPC: yourStreamingRPC,
});

function yourStreamingRPC(call) {
  console.log("Client connected. Sending acknowledgment...");

  // Send an acknowledgment immediately upon connection
  call.write({ text: "CONN_ACK" });

  call.on("data", (request) => {
    console.log("Server 1 received request:", request);
    const response = {
      text: `Server 1 got message: ${messageCount.count++}`,
      acknowledgeMessageId: request.id,
    };
    call.write(response);
  });

  call.on("end", () => {
    call.end();
  });

  call.on("error", (error) => {
    console.error("Errorrrrrrr:", error);
  });

  call.on("cancelled", () => {
    console.log("Client cancelled the stream");
  });
}

const ipAddress = process.env.SERVER1_IP;
const serverPort = process.env.SERVER1_PORT;

server.bindAsync(
  `${ipAddress}:${serverPort}`,
  grpc.ServerCredentials.createInsecure(),
  () => {
    console.log(`Server 1 running on ${ipAddress}:${serverPort}`);
  }
);
