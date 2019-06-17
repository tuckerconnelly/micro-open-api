const listen = require('test-listen');
const axios = require('axios');

const server = require('./__mocks__/server');

it('throws errors', async () => {
  const url = await listen(server);

  try {
    await axios.post(`${url}/test`, {
      emailFormat: 'asdf',
      minLength: '1',
      maxLength: '1234',
      nestedTest: {
        deeplyNestedString: 123
      }
    });
  } catch (err) {
    expect(err.response.data).toEqual({
      errors: {
        required: 'Required is required.',
        emailFormat: 'Email format must be in email format.',
        minLength: 'Min length must be at least 2 characters long.',
        maxLength: 'Max length must be less than 3 characters long.',
        nestedTest: {
          deeplyNested: 'Deeply nested is required.',
          deeplyNestedString: 'Deeply nested string must be a string.'
        }
      }
    });
  }
});
