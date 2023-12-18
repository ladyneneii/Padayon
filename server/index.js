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

  socket.on("join_private_room", (private_room_id) => {
    socket.join(private_room_id);
    console.log(`User with ID: ${socket.id} joined room: ${private_room_id}`);
  });

  socket.on("send_private_message", (privateMessageData) => {
    console.log(privateMessageData);

    // add message to database
    pool.getConnection((err, connection) => {
      if (err) throw err;
      connection.query(
        "INSERT INTO private_messages SET ?",
        privateMessageData,
        (err, rows) => {
          connection.release(); // return the connection to pool

          if (!err) {
            console.log(`Message has been added.`);
            // .to(room_id) means only the users in the same private room id can interact with each other. private_room_id works because it is the basis in socket.join()
            socket.to(privateMessageData.private_room_id).emit("receive_private_message", privateMessageData);
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

// Retrieve user full info with inputted username
app.get("/api/mhp_nhp_with_user_info/:usernameLatLon", (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    const usernameLatLon = req.params.usernameLatLon.split(",");
    const username = usernameLatLon[0];
    const lat1 = usernameLatLon[1];
    const lon1 = usernameLatLon[2];
    // console.log(username, lat1, lon1);

    connection.query(
      `SELECT Role FROM users WHERE Username = ?`,
      [username],
      (err, rows) => {
        connection.release();

        if (!err) {
          if (rows.length === 0) {
            res.send("This user does not exist.");
          } else {
            if (rows[0].Role === "mhp") {
              connection.query(
                `SELECT 
                  u.user_id,
                  u.Username,
                  u.firebase_avatar_url,
                  u.first_name,
                  u.middle_name,
                  u.last_name,
                  u.Age,
                  u.Gender,
                  u.Pronouns,
                  u.Role,
                  mhp.disorders_specializations,
                  mhp.Fees,
                  mhp.years_of_experience,
                  mhp.Languages,
                  mhp.min_age,
                  mhp.max_age,
                  mhp.Notes,
                  mhp.available_days,
                  mhp.available_hours,
                  l.Address,
                  l.Latitude,
                  l.Longitude
                FROM
                  users u
                INNER JOIN
                  mental_health_professionals mhp ON u.user_id = mhp.user_id
                INNER JOIN
                  locations l ON mhp.location_id = l.location_id
                WHERE Username = ?`,
                [username],
                (err, rows) => {
                  connection.release();

                  if (!err) {
                    if (rows.length === 0) {
                      res.send("This mhp does not exist.");
                    } else {
                      if (lat1 && lon1) {
                        const distanceAway = getDistance(
                          lat1,
                          lon1,
                          rows[0].Latitude,
                          rows[0].Longitude
                        );
                        const updatedRows = [
                          { ...rows[0], DistanceAway: distanceAway },
                          ...rows.slice(1),
                        ];

                        res.send(updatedRows[0]);
                      } else {
                        // user did not allow permission, so just return the object without the DistanceAway key.
                        res.send(rows[0]);
                      }
                    }
                  } else {
                    console.log(err);
                  }
                }
              );
            } else if (rows[0].Role === "nmhp") {
              connection.query(
                `SELECT 
                  u.user_id,
                  u.Username,
                  u.firebase_avatar_url,
                  u.first_name,
                  u.middle_name,
                  u.last_name,
                  u.Age,
                  u.Gender,
                  u.Pronouns,
                  u.Role
                FROM
                  users u
                WHERE Username = ?`,
                [username],
                (err, rows) => {
                  connection.release();

                  if (!err) {
                    if (rows.length === 0) {
                      res.send("This nmhp does not exist.");
                    } else {
                      res.send(rows[0]);
                    }
                  } else {
                    console.log(err);
                  }
                }
              );
            }
          }
        } else {
          console.log(err);
        }
      }
    );
  });
});

// Get all mhps with user info
app.get("/api/mhps_with_user_info", (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    connection.query(
      `SELECT 
        u.Username,
        u.firebase_avatar_url,
        u.first_name,
        u.middle_name,
        u.last_name,
        mhp.disorders_specializations,
      FROM 
        users u 
      INNER JOIN 
        mental_health_professionals mhp ON u.user_id = mhp.user_id
      INNER JOIN
        locations l ON mhp.location_id = l.location_id
      WHERE mhp.location_id IS NOT NULL`,
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

// get the distance between two coordinates in meters
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const metersAway = (R * c).toFixed(1); // Distance in meters
  const kilometersAway = ((R * c) / 1000).toFixed(3); // Distance in meters

  return { metersAway, kilometersAway };
}

// Get all mhps ordered by the distance between user and mhp
app.get("/api/mhps_with_user_info_ordered/:latLon", (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    const latLon = req.params.latLon.split(",");
    const lat1 = latLon[0];
    const lon1 = latLon[1];

    connection.query(
      `SELECT
        u.Username,
        u.firebase_avatar_url,
        u.first_name,
        u.middle_name,
        u.last_name,
        mhp.disorders_specializations,
        l.Latitude,
        l.Longitude
      FROM
        users u
      INNER JOIN
        mental_health_professionals mhp ON u.user_id = mhp.user_id
      INNER JOIN
        locations l ON mhp.location_id = l.location_id
      WHERE mhp.location_id IS NOT NULL
      ORDER BY
        l.Latitude, l.Longitude`,
      (err, rows) => {
        connection.release(); // return the connection to pool

        if (!err) {
          if (rows.length > 0) {
            // Calculate distance in JavaScript
            const resultsWithDistance = rows.map((row) => ({
              ...row,
              DistanceAway: getDistance(
                lat1,
                lon1,
                row.Latitude,
                row.Longitude
              ),
            }));

            // Sort the results by MetersAway just to make sure.
            const sortedResults = resultsWithDistance.sort(
              (a, b) => a.DistanceAway.metersAway - b.DistanceAway.metersAway
            );

            res.send(sortedResults);
          }
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
      `SELECT *, u.firebase_avatar_url 
      FROM messages m
      INNER JOIN 
        users u ON m.user_id = u.user_id
      WHERE room_id = ? 
      ORDER BY message_id`,
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

// Get all private rooms co-owned by user_id
app.get("/api/private_rooms/:user_id", (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    const user_id = req.params.user_id;

    connection.query(
      `SELECT 
        pr.*, 
        CASE 
          WHEN pr.member1_user_id = ? THEN u2.firebase_avatar_url
          WHEN pr.member2_user_id = ? THEN u1.firebase_avatar_url
        END AS avatar_url
      FROM 
        private_rooms pr
      LEFT JOIN 
        users u1 
      ON 
        pr.member1_user_id = u1.user_id
      LEFT JOIN 
        users u2 
      ON 
        pr.member2_user_id = u2.user_id
      WHERE 
        pr.member1_user_id = ? OR pr.member2_user_id = ?
      ORDER BY 
        private_room_id`,
      [user_id, user_id, user_id, user_id],
      (err, rows) => {
        connection.release();

        if (!err) {
          res.send(rows);
        } else {
          console.log(err);
        }
      }
    );
  });
});

// Add a private room
app.put("/api/private_rooms", upload.single("avatar_url"), (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    const params = req.body;
    params.member1_user_id = parseInt(params.member1_user_id, 10);
    params.member2_user_id = parseInt(params.member2_user_id, 10);

    connection.query(
      "SELECT private_room_id, Title FROM private_rooms",
      (err, rows) => {
        connection.release();

        if (!err) {
          const matchingRooms = rows.filter((row) => {
            const title = row.Title || ""; // Ensure title is a string
            return (
              title.includes(params.Member1) && title.includes(params.Member2)
            );
          });

          if (matchingRooms.length > 0) {
            console.log("Private room already exists.");
            const { private_room_id } = rows[0];
            res.send(private_room_id.toString());
          } else {
            // add private room to database
            connection.query(
              "INSERT INTO private_rooms SET ?",
              params,
              (err, rows) => {
                connection.release();

                if (!err) {
                  console.log("Added private room to database.");
                  res.json(rows.insertId);
                } else {
                  console.log(err);
                  res.status(500).json({ error: "Internal Server Error" });
                }
              }
            );
          }
        } else {
          console.log(err);
          res.status(500).json({ error: "Internal Server Error" });
        }
      }
    );
  });
});

// Get all messages in a room_id
app.get("/api/private_messages/:private_room_id", (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    connection.query(
      `SELECT pm.*, u.firebase_avatar_url 
      FROM private_messages pm
      INNER JOIN 
        users u ON pm.user_id = u.user_id
      WHERE private_room_id = ? 
      ORDER BY private_message_id`,
      [req.params.private_room_id],
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
      "UPDATE posts SET Content = ?, date_time = ?, Type = ?, Privacy = ?, Remark = ? WHERE post_id = ?",
      [
        params.Content,
        params.date_time,
        params.Type,
        params.Privacy,
        params.Remark,
        params.post_id,
      ],
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
      `SELECT 
        p.*, u.firebase_avatar_url 
      FROM 
        posts p
      INNER JOIN
        users u 
      ON 
        p.user_id = u.user_id
      WHERE 
        p.State != ? 
        AND post_reply_id IS NULL 
      ORDER BY 
        post_id DESC`,
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
          `SELECT p.*, u.firebase_avatar_url
          FROM 
            posts p
          INNER JOIN
            users u 
          ON 
            p.user_id = u.user_id
          WHERE 
            p.post_reply_id = ? 
            AND p.State != ?`,
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
