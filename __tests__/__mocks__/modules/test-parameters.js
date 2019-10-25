exports.schema = `
paths:
  /test-parameters:
    get:
      operationId: testParameters
      parameters:
        - name: required
          required: true
          schema:
            type: string
        - name: integer
          required: true
          schema:
            type: integer
        - name: boolean
          required: true
          schema:
            type: boolean
`;

exports.testParameters = async () => {
  return { ok: true };
};
