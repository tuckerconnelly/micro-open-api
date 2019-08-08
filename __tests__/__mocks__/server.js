const path = require('path');

const micro = require('micro');

const microOpenApi = require('../../index');

module.exports = () =>
  micro(
    microOpenApi(
      `
openapi: "3.0.0"
info:
  version: 1.0.0
  contact:
    name: Tucker Connelly
    email: web@tuckerconnelly.com
    url: https://tuckerconnelly.com
servers:
  - url: https://micro-open-api.com/api/v1
`,
      path.join(__dirname, './modules')
    )((req, res) => micro.send(res, 404))
  );

module.exports().listen(3004);
