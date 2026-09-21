const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const { ObjectId } = require("mongodb");
const { ChildProcess } = require("node:child_process");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
dotenv.config();

const uri = process.env.MONGODB_URI;

const app = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // 1. Check authorization header
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: No token provided",
      });
    }

    // 2. Validate Bearer format
    const [scheme, token, ...extra] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token || extra.length > 0) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Invalid token format",
      });
    }

    // 3. Verify JWT signature and claims
    const { payload } = await jwtVerify(token, JWKS);

    // 4. Store verified user information
    req.user = payload;
    // console.log(payload);
    // 5. Continue to the next middleware/route
    next();
  } catch (error) {
    // Invalid or expired JWT
    if (
      error.code === "ERR_JWT_INVALID" ||
      error.code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED" ||
      error.code === "ERR_JWT_EXPIRED" ||
      error.code === "ERR_JWS_INVALID"
    ) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Invalid or expired token",
      });
    }

    console.error("Authentication error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Authentication service error",
    });
  }
};

async function run() {
  try {
    //await client.connect();

    const db = client.db("wanderlust");
    const destinationCollection = db.collection("destinations");
    const bookingCollection = db.collection("bookings");

    // get destination from the server
    app.get("/destinations", async (req, res) => {
      const result = await destinationCollection.find().toArray();
      res.json(result);
    });

    // destination details
    app.get("/destinations/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      const result = await destinationCollection.findOne({
        _id: new ObjectId(id),
      });
      res.json(result);
    });

    // Add-destination to the database
    app.post("/destination",verifyToken, async (req, res) => {
      const destinationData = req.body;
      const result = await destinationCollection.insertOne(destinationData);
      res.json(result);
    });

    app.patch("/destinations/:id",verifyToken, async (req, res) => {
      try {
        const { id } = req.params;

        const updateData = req.body;

        delete updateData._id;

        const result = await destinationCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: updateData,
          },
        );

        res.json(result);
      } catch (error) {
        console.log(error);

        res.status(500).json({
          message: error.message,
        });
      }
    });

    // delete destination

    app.delete("/destinations/:id",verifyToken, async (req, res) => {
      const { id } = req.params;
      const result = await destinationCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.json(result);
    });

    // get booking info
    app.get("/booking/:userId", verifyToken, async (req, res) => {
      const { userId } = req.params;
      const result = await bookingCollection.find({ userId: userId }).toArray();
      res.json(result);
    });

    // booking destination
    app.post("/booking", async (req, res) => {
      const bookingData = req.body;
      const result = await bookingCollection.insertOne(bookingData);
      res.json(result);
    });

    // Delete booking
    app.delete("/booking/:bookingId",verifyToken, async (req, res) => {
      try {
        const { bookingId } = req.params; // Changed 'id' to 'bookingId'

        const result = await bookingCollection.deleteOne({
          _id: new ObjectId(bookingId),
        });

        if (result.deletedCount === 1) {
          res
            .status(200)
            .json({ success: true, message: "Booking deleted successfully" });
        } else {
          res
            .status(404)
            .json({ success: false, message: "Booking not found" });
        }
      } catch (error) {
        console.error("Error deleting booking:", error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    //await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server is running fine!!");
});

app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
});
