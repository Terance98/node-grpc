const grpc = require("grpc");
const app = require("express")();
//Loading the protocol buffer
const protoLoader = require("@grpc/proto-loader");
const packageDef = protoLoader.loadSync("todo.proto", {});

//Creating a gRPC object from the protocol buffer
const grpcObject = grpc.loadPackageDefinition(packageDef);
const todoPackage = grpcObject.todoPackage;

//To parse the input string -> node client.js CleanBed
const text = process.argv[2];

//Creating a client which will connect to our server
const client = new todoPackage.Todo(
  "localhost:40000",
  grpc.credentials.createInsecure() //there is also a secure method of doing this with the ssl
);

app.get("/", (req, res) => {
  /**
   * Unary RPC
   * Using the client to call the methods available in the server. First calling the createTodo method which creates a new todo item. Pass in the todo item object as input and also a callback function
   * When the server completes its process, it will call back this function to the client and it will get executed in the client side
   */
  client.createTodo(
    {
      id: -1,
      text: text,
    },
    (err, response) => {
      console.log("Created the new Todo : " + JSON.stringify(response));
    }
  );

  /**
   * ( Unary RPC ) - works like rest APIs
   * This is another function in the server to fetch all the todo items at once.
   * Since it is just a read operation, the first parameter is passed as null ( which is basically the input/data we send to the server )
   * We get an array of todo list items as the response here
  
    client.readTodos(null, (err, response) => {
      response.items && response.items.forEach((item) => console.log(item.text));
    });
  */

  /**
   * Server streaming RPC
   * Here just like Unary, client makes a request to the server and  the server is streaming the data asynchronously and continuously form the server
   * This streamed data is continuously recievend in the client side
   * Once all the data has been streamed, an end event is sent by the client and we stop the streaming consumption in the client side
   */
  const call = client.readTodosStream();

  // This method is used to consume the streamed data from the server
  let i = 0;
  call.on("data", (item) => {
    console.log("Streamed item from server " + JSON.stringify(item));
    i++;
  });

  // This method is used to trigger the end event sent from the server
  call.on("end", (e) => console.log("Streamed total items : ", i));
  res.send("Hello");
});

app.listen(3000, () => console.log("Listening on 3000"));
