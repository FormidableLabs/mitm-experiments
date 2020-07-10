"use strict";

const http = require("http");
const https = require("https");

const Mitm = require("mitm");
const uuid = require('uuid');

const YESNO_INTERNAL_HTTP_HEADER = 'x-yesno-internal-header-id';

// Our sample query.
const request = ({
  hostname,
  port,
  path,
  headers,
  method,
  data
}) => new Promise((resolve, reject) => {
  const req = https.request({
    hostname,
    port,
    path,
    method,
    headers: {
      "Content-Length": data ? Buffer.byteLength(data) : 0,
      ...headers
    }
  }, (res) => {
    let data;
    res.on("data", (d) => {
      console.log("TODO RES DATA", d.toString());
      data += d.toString();
    });
    res.on("pipe", () => {
      console.log("TODO RES PIPE");
    });
    res.on("end", () => {
      console.log("TODO RES END", data);
      resolve(data);
    });
  });

  req.on("error", reject);
  if (data) {
    req.write(data);
  }
  req.end();
});

class Interceptor {
  constructor() {
    this.clientRequests = {};
  }

  enable() {
    const self = this;
    this.mitm = Mitm(); // eslint-disable-line new-cap

    // Monkey-patch client requests to track options.
    const onSocket = http.ClientRequest.prototype.onSocket
    this._origOnSocket = onSocket;
    http.ClientRequest.prototype.onSocket = function (socket) {
      if (socket.__yesno_req_id !== undefined) {
        self.clientRequests[socket.__yesno_req_id].clientRequest = this;
        this.setHeader(YESNO_INTERNAL_HTTP_HEADER, socket.__yesno_req_id);
      }

      onSocket.call(this, socket);
    };

    this.mitm.on('connect', this.mitmOnConnect.bind(this));
    this.mitm.on('request', this.mitmOnRequest.bind(this));
    this.mitm.on('connection', (server) => {
      server.on('error', (err) => debug('Server error:', err));
    });
  }

  disable() {
    if (this.mitm) {
      this.mitm.disable();
      this.mitm = undefined;
    }
  }

  mitmOnConnect(socket, clientOptions) {
    // Mutate socket and track options for later proxying.
    socket.__yesno_req_id = uuid.v4();
    this.clientRequests[socket.__yesno_req_id] = { clientOptions };
  }

  mitmOnRequest(
    interceptedRequest,
    interceptedResponse
  ) {
    console.log("TODO FINISH mitmOnRequest", {
      interceptedRequest,
      interceptedResponse,
      clientRequests: this.clientRequests
    });

    const {
      headers,
      method
    } = interceptedRequest;
    const {
      hostname,
      port,
      path,
      data
    } = {};

    console.log("TODO NEED", {
      hostname,
      port,
      path,
      headers,
      method,
      data
    })
  }
}

module.exports = {
  Interceptor
};
