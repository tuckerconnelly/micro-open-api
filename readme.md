***Early Version***

# micro-open-api

Add OpenAPI schemas and validation to your [micro](https://github.com/zeit/micro) server.

## Features

 * Automatic parameter validation
 * Automatic DRY documentation for your api
 * Built on web standards

## Usage

```
npm i micro-open-api
```

Then where you define your HTTP server:

```js

const path = require('path');

const micro = require('micro');
const microOpenApi = require('micro-open-api');

module.exports = () =>
  micro(
    microOpenApi(
      `
openapi: "3.0.0"
info:
  version: 1.0.0
`,
      path.join(__dirname, './modules')
    )((req, res) => micro.send(res, 404))
  );
```

Then in `modules/test-endpoint.js` add:

```js
exports.schema = `
paths:
  /test-endpoint:
    post:
      operationId: testEndpoint
      requestBody:
        required: true
        content:
          application/json:
            schema:
              myRequiredParam: [required]
              properties:
                required:
                  type: string
`

// Must match operationId above
exports.testEndpoint = async () => {
  return { ok: true };
};
```

And then you can enjoy free request-body and parameter validation!

```
> http -b POST localhost:3000/test-endpoint

{"errors":{"myRequiredParam":"My required param is required."}}

```

You also get free documentation by pointing a [Swagger UI](https://swagger.io/tools/swagger-ui/) instance at `/open-api`.


## Other notes

You can point `micro-open-api` at any folder.

You can also define multiple endpoint paths if you like in any file--it'll just merge any `exports.schema` values that it finds.

---

> Whatever you do, work at it with all your heart, as working for the Lord, not for human masters, since you know that you will receive an inheritance from the Lord as a reward.

*Colossians 3:23*
