"use strict";

const https = require("https");
const { Interceptor } = require("../index");

const { expect } = require("chai");

const TEST_HEADER_VALUE = "foo";
const TEST_BODY_VALUE = "fiz";

// Our sample query.
const httpsPost = () => new Promise((resolve, reject) => {
  const postData = JSON.stringify({
    test: TEST_BODY_VALUE
  });

  const req = https.request({
    hostname: "postman-echo.com",
    port: 443,
    path: "/post",
    method: "POST",
    headers: {
      "x-test-header": TEST_HEADER_VALUE,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(postData)
    }
  }, (res) => {
    let data = "";
    res.on("data", (d) => {
      console.log("TODO RES DATA", d.toString());
      data += d.toString();
    });
    res.on("pipe", () => {
      console.log("TODO RES PIPE");
    });
    res.on("end", () => {
      console.log("TODO RES END", data);
      resolve(JSON.parse(data));
    });
  });

  req.on("error", reject);
  req.write(postData);
  req.end();
});

describe("without mitm", () => {
  it("does a vanilla request", async () => {
    const response = await httpsPost();

    expect(response, "Missing response").to.be.ok;
    expect(response).to.have.nested.property("headers.x-test-header", TEST_HEADER_VALUE);
    expect(response).to.have.nested.property("json.test", TEST_BODY_VALUE);
  });
});

describe("with mitm", () => {
  let interceptor;

  beforeEach(() => {
    interceptor = new Interceptor();
    interceptor.enable();
  });

  afterEach(() => {
    if (interceptor) {
      interceptor.disable();
    }
  });

  it("does an intercepted request", async () => {
    const response = await httpsPost();

    expect(response, "Missing response").to.be.ok;
    expect(response).to.have.nested.property("headers.x-test-header", TEST_HEADER_VALUE);
    expect(response).to.have.nested.property("json.test", TEST_BODY_VALUE);
  });
});
