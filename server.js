require("dotenv").config();
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

const PROTO_PATH = path.resolve(__dirname, "message.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const yourProto = grpc.loadPackageDefinition(packageDefinition);

const server = new grpc.Server();

let messageCount = 0;

server.addService(yourProto.YourService.service, {
  YourStreamingRPC: yourStreamingRPC,
});

function yourStreamingRPC(call) {
  call.on("data", (request) => {
    // Handle incoming request
    console.log("Received request:", request);

    // Process the request and send a response
    const response = {
      /* Your response message here */
      text: `Got message: ${messageCount++}`,
    };
    call.write(response);
  });

  call.on("end", () => {
    // Client has finished sending messages
    call.end();
  });

  call.on("error", (error) => {
    // Handle errors
    console.error("Error:", error);
  });

  call.on("cancelled", () => {
    // Handle cancellation
    console.log("Client cancelled the stream");
  });
}

// Dynamically determine the IP address of any available network interface
const ipAddress = process.env.SERVER_IP;
// Use a consistent port (e.g., 50051)
const serverPort = process.env.SERVER_PORT;

// Bind to the specified IP address and port
server.bindAsync(
  `${ipAddress}:${serverPort}`,
  grpc.ServerCredentials.createInsecure(),
  () => {
    console.log(`Server running on ${ipAddress}:${serverPort}`);
  }
);

// server.start();
