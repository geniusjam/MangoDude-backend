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
            socket.emit("authed", r);

            onlinePlayers.push(socket);
        });
    });

    socket.on("disconnect", () => {
        if (!socket.user) return;
        onlinePlayers = onlinePlayers.splice(
            onlinePlayers.findIndex((q) => q.id === socket.id),
            1
        );
    });
});
