const express = require("express");
const app = express();
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const multer = require("multer");
const mysql = require("mysql2");
app.use(cors());
const port = process.env.PORT || 3001;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id}`);

  socket.on("join_room", (data) => {
    socket.join(data);
    console.log(`User with ID: ${socket.id} joined room: ${data}`);
  });

  socket.on("send_message", (data) => {
    console.log(data);
    // .to(data.room) means only the users in the same room can receive the message
    socket.to(data.room).emit("receive_message", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);
  });
});

server.listen(port, () => {
  console.log("SERVER RUNNING");
});

app.use(express.static("../client")); // This directs it to the index.html file in the client folder
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Use multer to handle file uploads
const upload = multer();

// MySQL
const pool = mysql.createPool({
  connectionLimit: 10,
  host: "localhost",
  user: "root",
  password: "root",
  database: "padayon",
});

// Get all users
app.get("/api/users", (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    console.log(`connected as id ${connection.threadId}`);

    connection.query("SELECT * FROM users", (err, rows) => {
      connection.release(); // return the connection to pool

      if (!err) {
        res.send(rows);
      } else {
        console.log(err);
      }
    });
  });
});

// Retrieve user with inputted username
app.get("/api/username_check/:username", (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    console.log(`connected as id ${connection.threadId}`);

    connection.query(
      "SELECT * FROM users WHERE Username = ?",
      [req.params.username],
      (err, rows) => {
        connection.release(); // return the connection to pool

        if (!err) {
          if (rows.length === 0) {
            res.send("This is a unique username.");
          } else {
            res.status(404).send("This username already exists.");
          }
        } else {
          console.log(err);
        }
      }
    );
  });
});

// Retrieve user with inputted email
app.get("/api/email_check/:email", (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    console.log(`connected as id ${connection.threadId}`);

    connection.query(
      "SELECT * FROM users WHERE Email = ?",
      [req.params.email],
      (err, rows) => {
        connection.release(); // return the connection to pool

        if (!err) {
          if (rows.length === 0) {
            res.send("This is a unique email.");
          } else {
            res.status(404).send("This email already exists.");
          }
        } else {
          console.log(err);
        }
      }
    );
  });
});

// Retrieve user with inputted email and password
app.get("/api/users/:emailPass", (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    console.log(`connected as id ${connection.threadId}`);

    const emailPass = req.params.emailPass.split(",");
    const email = emailPass[0];
    const pwd = emailPass[1];

    console.log(`The email and password are ${email} and ${pwd}`);

    connection.query(
      "SELECT * FROM users WHERE Email = ? AND Password = ?",
      [email, pwd],
      (err, rows) => {
        connection.release(); // return the connection to pool

        if (!err) {
          if (rows.length === 0) {
            // No user found with the specified email and password
            res.status(404).send("User not found");
          } else {
            // User found, send the user data
            res.send(rows[0]);
          }
        } else {
          console.log(err);
        }
      }
    );
  });
});

// Add a user
app.post("/api/users", upload.single("avatar_url"), (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    console.log(`connected as id ${connection.threadId}`);

    const params = req.body;
    // Add the file path to the params
    params.avatar_url = req.file.originalname;

    connection.query("INSERT INTO users SET ?", params, (err, rows) => {
      connection.release(); // return the connection to pool

      if (!err) {
        res.send(`User ${params.username} has been added.`);
      } else {
        console.log(err);
      }
    });

    console.log(req.body);
  });
});

// Add or update a room
app.put("/api/rooms", upload.single("avatar_url"), (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    console.log(`connected as id ${connection.threadId}`);
    console.log("This is req.body", req.body);
    const params = req.body;

    connection.query(
      "SELECT * FROM rooms WHERE Title = ? AND Password = ?",
      [params.Title, params.Password],
      (err, rows) => {
        connection.release(); // return the connection to pool

        if (!err) {
          if (rows.length === 0) {
            console.log("NEW ROOM");
            console.log("This is params", params);
            connection.query("INSERT INTO rooms SET ?", params, (err, rows) => {
              connection.release(); // return the connection to pool

              if (!err) {
                res.send(`Room ${params.Title} has been added.`);
              } else {
                console.log(err);
              }
            });
          } else {
            const existingMembers = rows[0].Members;

            // Check if params.Members already exists in the existingMembers string
            if (!existingMembers.includes(params.Members)) {
              // If it doesn't exist, update the 'Members' column
              connection.query(
                "UPDATE rooms SET Members = CONCAT_WS(', ', Members, ?) WHERE Title = ? AND Password = ?",
                [params.Members, params.Title, params.Password],
                (err, rows) => {
                  connection.release(); // return the connection to the pool

                  if (!err) {
                    if (params.State === "Active") {
                      res.send(
                        `Room with the Title: ${params.Title} has been updated.`
                      );
                    } else if (params.State === "Blocked") {
                      console.log("This room is blocked.");
                    } else if (params.State === "Pending") {
                      console.log("This room is still pending.");
                    }
                  } else {
                    console.log(err);
                  }
                }
              );
            } else {
              if (params.State === "Active") {
                // If params.Members already exists, you may want to handle this case accordingly
                res.send(
                  `Room with the Title: ${params.Title} is already associated with ${params.Members}.`
                );
              } else if (params.State === "Blocked") {
                console.log("This room is blocked.");
              } else if (params.State === "Pending") {
                console.log("This room is still pending.");
              }
            }
          }
        } else {
          console.log(err);
        }
      }
    );
  });
});
