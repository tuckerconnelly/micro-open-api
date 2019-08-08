exports.schema = `
paths:
  /test-json-body:
    post:
      operationId: testJsonBody
      requestBody:
        required: true
        content:
          application/json:
            schema:
              required: [required, nestedTest]
              properties:
                required:
                  type: string
                emailFormat:
                  type: string
                  format: email
                minLength:
                  type: string
                  minLength: 2
                maxLength:
                  type: string
                  maxLength: 3 
                nestedTest:
                  type: object
                  required: [deeplyNested]
                  properties:
                    deeplyNested:
                      type: string
                    deeplyNestedString:
                      type: string

`;

exports.testJsonBody = async () => {
  return { ok: true };
};
