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

// Send user_id and location whether null or existing
app.get("/api/location_check/:user_id", (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    connection.query(
      "SELECT * FROM mental_health_professionals WHERE user_id = ?",
      [req.params.user_id],
      (err, rows) => {
        connection.release();

        if (!err) {
          if (rows.length === 0) {
            res.send("This user is not a mental health professional.");
          } else {
            res.json(rows[0]);
          }
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
    const user_id = params.user_id;
    // delete user_id since it is not part of the insert query, but save it first because it is used to update the location_id of the user
    delete params.user_id;

    if (params.location_id === "null") {
      // Delete location_id since it is null
      delete params.location_id;
      // Add a location
      connection.query("INSERT INTO locations SET ?", params, (err, rows) => {
        connection.release();
        // Get new location_id
        const location_id = rows.insertId;

        if (!err) {
          // update location_id of mhp user
          connection.query(
            "UPDATE mental_health_professionals SET location_id = ? WHERE user_id = ?",
            [location_id, user_id],
            (err, rows) => {
              connection.release();

              if (!err) {
                console.log("Successfully added location");
                res.json(rows);
              } else {
                console.log(err);
              }
            }
          );
        } else {
          console.log(err);
        }
      });
    } else {
      // Update coordinates
      // Use location_id to update the coords
      connection.query(
        "UPDATE locations SET Latitude = ?, Longitude = ? WHERE location_id = ?",
        [params.Latitude, params.Longitude, params.location_id],
        (err, rows) => {
          connection.release();

          if (!err) {
            console.log("Successfully updated location");
            res.json(rows);
          } else {
            console.log(err);
          }
        }
      );
    }
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

// Add a post
app.post("/api/posts", upload.single("avatar_url"), (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    const params = req.body;

    connection.query("INSERT INTO posts SET ?", params, (err, rows) => {
      connection.release(); // return the connection to pool

      if (!err) {
        res.json(rows);
      } else {
        console.log(err);
      }
    });
  });
});

// Change a post
app.patch("/api/posts", upload.single("avatar_url"), (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    const params = req.body;

    connection.query(
      "UPDATE posts SET Content = ? WHERE post_id = ?",
      [params.Content, params.post_id],
      (err, rows) => {
        connection.release(); // return the connection to pool

        if (!err) {
          res.json(rows);
        } else {
          console.log(err);
        }
      }
    );
  });
});

// Delete a post
app.delete("/api/posts", upload.single("avatar_url"), (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    const params = req.body;

    connection.query(
      "DELETE FROM posts WHERE post_id = ?",
      [params.post_id],
      (err, rows) => {
        connection.release(); // return the connection to pool

        if (!err) {
          console.log("This is");
          console.log(params.post_id);
          res.json(rows);
        } else {
          // update post's state to MarkedDeleted
          const State = "MarkedDeleted";
          connection.query(
            "UPDATE posts SET State = ? WHERE post_id = ?",
            [State, params.post_id],
            (err, rows) => {
              connection.release();

              if (!err) {
                console.log(rows);
                console.log(params.post_id);
                console.log(State);
                res.send("MarkedDeleted");
              } else {
                console.log(err);
              }
            }
          );
        }
      }
    );
  });
});

// undo delete
app.patch("/api/undo_delete_post/:post_id", (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    connection.query(
      "UPDATE posts SET State = ? WHERE post_id = ?",
      ["Visible", req.params.post_id],
      (err, rows) => {
        connection.release(); // return the connection to pool

        if (!err) {
          res.send("Success.");
        } else {
          console.log(err);
        }
      }
    );
  });
});

const async = require("async");

// Get all posts
app.get("/api/posts", (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    const State = "Hidden";
    let ordered_rows = [];

    // get the root posts
    connection.query(
      "SELECT * FROM posts WHERE State != ? AND post_reply_id IS NULL ORDER BY post_id DESC",
      [State],
      (err, rows) => {
        connection.release();

        getOrderedPosts(res, connection, ordered_rows, rows, () => {
          // Callback to send the response once all operations are complete
          res.send(ordered_rows);
        });
      }
    );
  });
});

function getOrderedPosts(res, connection, ordered_rows, rows, callback) {
  if (rows.length > 0) {
    let count = 0;

    async.eachSeries(
      rows,
      (row, innerCallback) => {
        const { post_id } = row;
        const State = "Hidden";

        ordered_rows.push(row);

        // Get the first level replies
        connection.query(
          "SELECT * FROM posts WHERE post_reply_id = ? AND State != ?",
          [post_id, State],
          (err, replies) => {
            if (!err) {
              count++;
              getOrderedPosts(
                res,
                connection,
                ordered_rows,
                replies,
                innerCallback
              );
            } else {
              console.log(err);
              innerCallback(err); // If an error occurs, pass it to the callback
            }
          }
        );
      },
      (err) => {
        if (!err) {
          if (count === rows.length) {
            callback(); // Signal completion to the outer callback
          }
        } else {
          console.log(err);
          res.status(500).send("Internal Server Error");
        }
      }
    );
  } else {
    callback(); // If there are no rows, signal completion directly
  }
}
