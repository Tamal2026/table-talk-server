const jwt = require("jsonwebtoken");
require("dotenv").config();

const express = require("express");
const WebSocket = require("ws");

const app = express();
const cors = require("cors");
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@try-myself.0cjln25.mongodb.net/?retryWrites=true&w=majority&appName=Try-Myself`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const UserCollection = client.db("tableTalk").collection("users");
    const menuCollection = client.db("tableTalk").collection("menu");
    const cartCollection = client.db("tableTalk").collection("carts");

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // Middleware to verify JWT token
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Forbidden Access" });
      }

      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Forbidden Access" });
        }

        req.decoded = decoded;
        next();
      });
    };

    // jwt related api

    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    // Users related APIs
    app.get("/users", verifyToken, async (req, res) => {
      const result = await UserCollection.find().toArray();
      res.send(result);
    });
    app.get("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Unauthorized access" });
      }
      const query = { email: email };
      const user = await UserCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({admin})
    });

    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id; // Extracting the ID correctly

      // Validate the ID
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid user ID format" });
      }

      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };

      try {
        const result = await UserCollection.updateOne(filter, updatedDoc);
        if (result.modifiedCount > 0) {
          return res.send(result);
        } else {
          return res
            .status(404)
            .send({ message: "User not found or already an admin" });
        }
      } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;

      // Validate the ID
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid user ID format" });
      }

      const query = { _id: new ObjectId(id) };
      try {
        const result = await UserCollection.deleteOne(query);
        if (result.deletedCount > 0) {
          return res.send(result);
        } else {
          return res.status(404).send({ message: "User not found" });
        }
      } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await UserCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists" });
      }
      const result = await UserCollection.insertOne(user);
      res.send(result);
    });

    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });

    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB!");
  } catch (error) {
    console.error("Database connection error:", error);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("The Server is running");
});

// Initialize WebSocket Server
const server = app.listen(port, () => {
  console.log(`Table Talk is running on port ${port}`);
});

const wss = new WebSocket.Server({ server, path: "/ws" });

// WebSocket connection handling
wss.on("connection", (ws) => {
  console.log("New client connected");

  ws.on("message", (message) => {
    console.log("Received:", message);

    // Broadcast message to all clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(`Echo: ${message}`);
      }
    });
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});
