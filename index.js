const jwt = require("jsonwebtoken");
require("dotenv").config();

const express = require("express");
const WebSocket = require("ws");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const multer = require("multer");
const upload = multer({ dest: "uploads/" });

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
    // await client.connect();
    const UserCollection = client.db("tableTalk").collection("users");
    const menuCollection = client.db("tableTalk").collection("menu");
    const cartCollection = client.db("tableTalk").collection("carts");
    const paymentCollection = client.db("tableTalk").collection("payments");
    const bookTableCollection = client.db("tableTalk").collection("bookTable");
    const reviewsCollection = client.db("tableTalk").collection("reviews");
    // jwt related api
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // Middleware to verify JWT token
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Unauthorized Access" });
      }

      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized Access" });
        }

        req.decoded = decoded;
        next();
      });
    };
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await UserCollection.findOne(query);
      const isAdmin = user?.role === "admin";

      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    // Menu Related Apis
    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });
    app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result);
    });

    app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/menu/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.findOne(query);
      res.send(result);
    });
    app.patch("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const { name, category, price, short_desc, description } = req.body;

      const updatedDoc = {
        $set: {
          name,
          category,
          price,
          short_desc,
          description,
        },
      };

      try {
        const result = await menuCollection.updateOne(filter, updatedDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to update item" });
      }
    });
    // Users related APIs
    app.get("/users", verifyToken, async (req, res) => {
      const result = await UserCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/:email", verifyToken,  async (req, res) => {
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
      res.send({ admin });
    });

    app.patch("/users/:id",  async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid user ID format" });
      }

      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };

      const result = await UserCollection.updateOne(filter, updatedDoc);

      return res.send(result);
    });

    app.delete("/users/:id",  async (req, res) => {
      const id = req.params.id;

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

    app.post("/users", verifyToken,verifyAdmin, async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await UserCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists" });
      }
      const result = await UserCollection.insertOne(user);
      res.send(result);
    });

    app.post("/carts",verifyToken, async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });
    // Delete cart item by ID
    app.delete("/carts/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/carts",verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    // Booking Table related Apis

    app.get("/bookTable",verifyToken, async (req, res) => {
      const result = await bookTableCollection.find().toArray();
      res.send(result);
    });
    app.delete("/bookTable/:id",verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookTableCollection.deleteOne(query);
      res.send(result);
    });

    app.post("/bookTable", async (req, res) => {
      const bookTable = req.body;
      const result = await bookTableCollection.insertOne(bookTable);
      res.send(result);
    });
    app.get("/bookTable/:email",verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await bookTableCollection.find(query).toArray();
      res.send(result);
    });
    app.delete("/bookTable/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookTableCollection.deleteOne(query);
      res.send(result);
    });
    // Payment Related Api
    app.post("/create-payment-intent",
       async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount, "Amount insi de the client intent");
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments",verifyToken, async (req, res) => {
      try {
        const payment = req.body;

        const paymentResult = await paymentCollection.insertOne(payment);

        const query = {
          _id: {
            $in: payment.cartId.map((id) => new ObjectId(id)),
          },
        };

        // Delete the cart items
        const deleteResult = await cartCollection.deleteMany(query);

        // Send both results as a single response object
        res.send({
          paymentResult,
          deleteResult,
          status: "success",
        });
      } catch (error) {
        console.error("Error processing payment:", error);
        res.status(500).send({
          status: "error",
          message: "Failed to process payment",
          error: error.message,
        });
      }
    });

    app.get("/payments/:email", verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/userHome",verifyToken, async (req, res) => {
      try {
        const email = req.query.email;
        const query = { email: email };
        const result = await paymentCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error("Erros From the userOVer view", error);
      }
    });

    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      const users = await UserCollection.estimatedDocumentCount();
      const orders = await cartCollection.estimatedDocumentCount();
      const result = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: "$price",
              },
            },
          },
        ])
        .toArray();

      const revenue = result.length > 0 ? result[0].totalRevenue : 0;
      res.send({ users, orders, revenue });
    });
    const { ObjectId } = require("mongodb");

    app.get("/order-stats", verifyToken, verifyAdmin, async (req, res) => {
      const result = await paymentCollection
        .aggregate([
          {
            $unwind: "$MenuId",
          },
          {
            $addFields: {
              MenuIdObject: { $toObjectId: "$MenuId" },
            },
          },
          {
            $lookup: {
              from: "menu",
              localField: "MenuIdObject",
              foreignField: "_id",
              as: "menuItems",
            },
          },
          {
            $unwind: "$menuItems",
          },
          {
            $group: {
              _id: "$menuItems.category",
              quantity: { $sum: 1 },
              revenue: { $sum: "$menuItems.price" },
            },
          },
          {
            $project: {
              _id: 0,
              category: "$_id",
              quantity: "$quantity",
              revenue: "$revenue",
            },
          },
        ])
        .toArray();

      res.send(result);
    });

    // Reviews Related Apis
    app.post("/reviews", async (req, res) => {
      const reviews = req.body;
      const result = await reviewsCollection.insertOne(reviews);
      res.send(result);
    });
    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    // console.log("Connected to MongoDB!");
  } catch (error) {
    console.error("Database connection error:", error);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("The Server is running");
});

// Initialize WebSocket Server
app.listen(port, () => {
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
