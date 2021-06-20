const grpc = require("grpc");

//Loading the protocol buffer
const protoLoader = require("@grpc/proto-loader");
const packageDef = protoLoader.loadSync("todo.proto", {});

// Creating a gRPC object from the protocol buffer
const grpcObject = grpc.loadPackageDefinition(packageDef);
const todoPackage = grpcObject.todoPackage;

// Creating a new grpc server
const server = new grpc.Server();

// Binding the IP address ( which is localhost here ) and the port address for the server
server.bind("0.0.0.0:40000", grpc.ServerCredentials.createInsecure());

// Adding our protocol buffer methods into the server
// Each time a new method is to be added, add it in the protocol buffer and then import it here
server.addService(todoPackage.Todo.service, {
  createTodo: createTodo,
  readTodos: readTodos,
  readTodosStream: readTodosStream,
});

// Starting the server
server.start();

// The array to hold the list of todos as long as the server is not killed. Here its used as a replacement for an actual db
const todos = [];

/**
 * Function to create a new todolist item - Unary RPC
 * @param {*} call
 * @param {*} callback
 * Function to create a new todo list item. The item is then pushed to the todos array
 * Here call is like the req object we get for rest APIs. It contains our data sent from the client and a set of predefined properties and methods
 * call.request contains our json sent from the client side.
 * This data will be recieved in a compressed binary format ( which is done by gRPC and HTTP/2 )
 * The data is then deserialized at the server end to give us the actual JSON which was sent
 */
function createTodo(call, callback) {
  const todoItem = {
    id: todos.length + 1,
    text: call.request.text,
  };
  todos.push(todoItem);
  callback(null, todoItem);
}

// Unary RPC
// Returns all the todolist items in the todos array
// Make sure we follow the format set in the protocol buffer - here it expects and object with { items : [list of items ]} as we set it in the protocol buffer
function readTodos(call, callback) {
  callback(null, { items: todos });
}

/**
 * Function to stream the todo list one by one to the client side - Server Side Streaming RPC
 * @param {*} call
 * @param {*} callback
 * This method makes use of the server side streaming, where we stream the data to the client one by one
 * call.write() method is used to push the data to the client
 * call.on("data", ()) method is being used by the client to listen to this streamed data
 */
function readTodosStream(call, callback) {
  todos.forEach((t) => call.write(t));
  call.end();
}
