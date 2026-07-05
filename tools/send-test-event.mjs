import dgram from "node:dgram";

const event = process.argv[2] ?? "player.damage";
const socket = dgram.createSocket("udp4");
const payload = Buffer.from(JSON.stringify({
  type: event,
  source: "manual-test",
}));

socket.send(payload, 47321, "127.0.0.1", (error) => {
  if (error) {
    console.error(error);
    process.exitCode = 1;
  }
  socket.close();
});

