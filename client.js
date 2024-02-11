require("dotenv").config();
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

const PROTO_PATH = path.resolve(__dirname, "message.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const yourProto = grpc.loadPackageDefinition(packageDefinition);

const serverPort = 4000;
const ipAddress = "54.210.22.200";

const client = new yourProto.YourService(
  `${ipAddress}:${serverPort}`,
  grpc.credentials.createInsecure()
);

const call = client.YourStreamingRPC();

call.on("data", (response) => {
  // Handle incoming response from the server
  console.log("Received response:", response);
});

call.on("end", () => {
  // Server has finished sending messages
  console.log("Server finished streaming");
});

call.on("error", (error) => {
  // Handle errors
  console.error("Error:", error);
});

call.on("status", (status) => {
  // Handle status updates
  console.log("Status:", status);
});

// Send streaming messages to the server
const messagesToSend = [
  {
    /* Your request message 1 */
    text: "Hello there!",
  },
  {
    /* Your request message 2 */
    text: "Hello there!",
  },
  // Add more messages as needed
];

setInterval(() => {
  messagesToSend.forEach((message) => {
    call.write(message);
  });
}, 1);

// Indicate that the client has finished sending messages
// call.end();
