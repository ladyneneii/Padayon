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

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  socket.on("join_room", (room_id) => {
    // using room_id here means that this is the basis of the rooms, not the room name itself
    socket.join(room_id);
    console.log(`User with ID: ${socket.id} joined room: ${room_id}`);
  });

  socket.on("send_message", (messageData) => {
    console.log(messageData);

    // add message to database
    pool.getConnection((err, connection) => {
      if (err) throw err;
      connection.query(
        "INSERT INTO messages SET ?",
        messageData,
        (err, rows) => {
          connection.release(); // return the connection to pool

          if (!err) {
            console.log(`Message has been added.`);
            // .to(room_id) means only the users in the same room id can interact with each other. room_id works because it is the basis in socket.join()
            socket.to(messageData.room_id).emit("receive_message", messageData);
          } else {
            console.log(err);
          }
        }
      );
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);
  });
});

// Get all users
app.get("/api/users", (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
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
            res.send(rows);
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
    const params = req.body;
    console.log(params);
    // Add the file path to the params
    params.avatar_url = req.file.originalname;

    connection.query("INSERT INTO users SET ?", params, (err, rows) => {
      connection.release(); // return the connection to pool

      if (!err) {
        res.json(rows.insertId);
      } else {
        console.log(err);
      }
    });
  });
});

// Add a mental health professional
app.post("/api/mhps", upload.single("avatar_url"), (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    const params = req.body;

    connection.query(
      "INSERT INTO mental_health_professionals SET ?",
      params,
      (err, rows) => {
        connection.release(); // return the connection to pool

        if (!err) {
          // update State from Unverified to Active
          connection.query(
            "UPDATE users SET State = ? WHERE user_id = ?",
            ["Active", params.user_id],
            (err, rows) => {
              connection.release(); // return the connection to pool

              if (!err) {
                res.json(rows);

              } else {
                console.log(err);
              }
            }
          );
        } else {
          console.log(err);
        }
      }
    );
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
                console.log(`Room ${params.Title} has been added.`);

                // Perform a SELECT query to get the details of the inserted room
                connection.query(
                  "SELECT * FROM rooms WHERE room_id = ?",
                  [rows.insertId],
                  (err, rows) => {
                    connection.release(); // return the connection to pool

                    if (!err) {
                      console.log("This is the inserted row ", rows);
                      // Send the details of the inserted room as the response to the client
                      res.send(rows);
                    } else {
                      console.log(err);
                      res
                        .status(500)
                        .send("Error fetching inserted room details");
                    }
                  }
                );
              } else {
                console.log(err);
              }
            });
          } else {
            if (rows[0].State === "Active") {
              const existingMembers = rows[0].Members;

              // Check if params.Members already exists in the existingMembers string
              if (!existingMembers.includes(params.Members)) {
                // If it doesn't exist, update the 'Members' column
                connection.query(
                  "UPDATE rooms SET Members = CONCAT_WS(', ', Members, ?) WHERE Title = ? AND Password = ?",
                  [params.Members, params.Title, params.Password],
                  (err, updatedRows) => {
                    connection.release(); // return the connection to the pool

                    if (!err) {
                      console.log(
                        `Room with the Title: ${params.Title} has been updated.`
                      );
                      console.log(rows);

                      // send room details here to the client
                      res.send(rows);
                    } else {
                      console.log(err);
                    }
                  }
                );
              } else {
                // If params.Members already exists, you may want to handle this case accordingly
                console.log(
                  `Room with the Title: ${params.Title} is already associated with ${params.Members}.`
                );
                console.log(rows);

                // send room details here to the client
                res.send(rows);
              }
            } else if (params.State === "Blocked") {
              console.log("This room is blocked.");
            } else if (params.State === "Pending") {
              console.log("This room is still pending.");
            }
          }
        } else {
          console.log(err);
        }
      }
    );
  });
});

// Get all messages in a room_id
app.get("/api/rooms/:room_id", (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    console.log(`connected as id ${connection.threadId}`);

    connection.query(
      "SELECT * FROM messages WHERE room_id = ? ORDER BY message_id",
      [req.params.room_id],
      (err, rows) => {
        connection.release(); // return the connection to pool

        if (!err) {
          res.send(rows);
        } else {
          console.log(err);
        }
      }
    );
  });
});

// Add or update a location
app.put("/api/locations", upload.single("avatar_url"), (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    const params = req.body;

    connection.query(
      "SELECT * FROM locations WHERE user_id = ?",
      [params.user_id],
      (err, rows) => {
        connection.release(); // return the connection to pool

        if (!err) {
          if (rows.length === 0) {
            connection.query(
              "INSERT INTO locations SET ?",
              params,
              (err, rows) => {
                connection.release();

                if (!err) {
                  res.send(`Lat and lon have been added.`);
                } else {
                  console.log(err);
                }
              }
            );
          } else if (rows.length === 1) {
            connection.query(
              "UPDATE locations SET Latitude = ?, Longitude = ?  WHERE user_id = ?",
              [params.Latitude, params.Longitude, params.user_id],
              (err, updatedRows) => {
                connection.release();

                if (!err) {
                  res.send(`Lat and lon have been updated.`);
                } else {
                  console.log(err);
                }
              }
            );
          }
        } else {
          console.log(err);
        }
      }
    );
  });
});

// Get all locations
app.get("/api/locations", (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    connection.query("SELECT * FROM locations", (err, rows) => {
      connection.release(); // return the connection to pool

      if (!err) {
        res.send(rows);
      } else {
        console.log(err);
      }
    });
  });
});
