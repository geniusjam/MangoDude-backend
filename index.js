/**
 * Removes an element from the array that satisfies the given function
 * @param {Function} func the selector function
 */
Array.prototype.remove = (func) => {
    return this.splice(this.findIndex(func), 1);
};

const express = require("express");
const helmet = require("helmet");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const app = express();

mongoose.connect(process.env.DATABASE_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", function () {
    console.log("DB connection ready!");
});
const playerSchema = new mongoose.Schema({
    username: String,
    password: String,
    trees: Array,
    mangoes: Number,
});
const Player = mongoose.model("players", playerSchema);

app.use(helmet());
app.use(bodyParser.urlencoded({ extended: false }));

app.post("/signup", async (req, res, n) => {
    const { username, password } = req.body;
    if (
        !username ||
        !password ||
        typeof username !== "string" ||
        typeof password !== "string"
    )
        return n();

    if (/[^a-zA-Z0-9-_]/g.test(username))
        return res.send("Your username includes forbidden characters!");

    Player.findOne({ username }, async (e, r) => {
        if (e) {
            console.error(e);
            return res.send("Database error.");
        }
        if (r) return res.send("A player with this username already exists.");

        const doc = new Player({
            username,
            password: await bcrypt.hash(password, 10),
            trees: [],
            mangoes: 10,
        });
        await doc.save();
        res.send("OK");
    });
});

const DEFAULTS = {
    playerPosition: {
        x: 500 - 16 / 2,
        y: 700 - 33 - 31,
    },
};

const server = app.listen(process.env.PORT || 3000, () =>
    console.log("HTTP server ready!")
);
const io = require("socket.io")(server);

let onlinePlayers = [];

io.on("connection", (socket) => {
    socket.user = null;

    socket.on("auth", (data) => {
        if (socket.user) return;
        const { username, password } = data;
        if (!username || !password) return;

        Player.findOne({ username }, async (e, r) => {
            if (e) {
                console.error(e);
                socket.emit("authfail");
                return;
            }
            if (!r) return socket.emit("authfail");
            if (!(await bcrypt.compare(password, r.password)))
                return socket.emit("authfail");
            socket.user = r;
            delete r.password;
            r.serverTime = Date.now(); //TODO: calculate ping for more accurate time calculations on the front end
            socket.emit("authed", r);

            socket.guests = []; //island guests
            socket.host = null;
            socket.x = 0;
            socket.y = 0;
            onlinePlayers.push(socket);
        });
    });

    socket.on("visit", (data) => {
        if (typeof data !== "string") return;

        /** the socket of the island owner */
        const hostSocket = onlinePlayers.find(
            (socket) => socket.user.username === data
        );
        if (!hostSocket) return socket.emit("usernameNotFound");
        if (socket.id == hostSocket.id) return; //You can't visit your own island, you have to `back` for that

        hostSocket.guests.push(socket);
        socket.host = hostSocket;
        //emit `join` to all guests of the island, including the owner (if the owner is in the island)
    });

    socket.on("back", () => {
        //send the player to their own islands
        if (!socket.host) return; //the player is already on their island
        socket.host.guests.remove((guest) => guest.id === socket.id);
        //TODO: send `leave` to all guests of the island, including the owner (if the owner is in the island)
        socket.host = null;
        socket.emit("guests", socket.guests); //just in case some guests joined the island while the owner was out

        socket.x = DEFAULTS.playerPosition.x;
        socket.y = DEFAULTS.playerPosition.y;
    });

    socket.on("buyTree", () => {
        //TODO: check the price
    });

    socket.on("move", (data) => {
        /** the x and y coords of the location the player wants to move to */
        const { x, y } = data;
        if (typeof x !== "number" || typeof y !== "number") return;

        socket.x = DEFAULTS.playerPosition.x;
        socket.y = DEFAULTS.playerPosition.y;

        //TODO: check if there are other players in the island, if so update them too.
    });

    socket.on("harvest", (data) => {
        if (
            typeof data !== "number" ||
            data < 0 ||
            data >= socket.user.trees.length ||
            data != Math.floor(data) //isn't integer
        )
            return;

        if (socket[data].endsAt > Date.now()) return socket.emit("notGrown"); //this tree hasn't grown up yet

        //TODO: decide some amount of mangoes to give to the player
        //TODO: set a new endsAt for the tree
        //TODO: upate the player and tree records in the database
    });

    socket.on("disconnect", () => {
        if (!socket.user) return;
        //TODO: send players in the island of the disconnected player to their own island.
        onlinePlayers = onlinePlayers.splice(
            onlinePlayers.findIndex((q) => q.id === socket.id),
            1
        );
    });
});
