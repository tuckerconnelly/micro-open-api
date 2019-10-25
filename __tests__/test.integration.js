const assert = require('assert');

const listen = require('test-listen');
const axios = require('axios');

const server = require('./__mocks__/server');

it('throws proper errors for json bodies', async () => {
  const url = await listen(server());

  try {
    await axios.post(`${url}/test-json-body`, {
      emailFormat: 'asdf',
      emailFormatSpace: '  asdf@asdf.com',
      minLength: '1',
      maxLength: '1234',
      nestedTest: {
        deeplyNestedString: 123
      }
    });

    assert(false, `Shouldn't have got here.`);
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

it('throws proper errors for parameters', async () => {
  const url = await listen(server());

  try {
    await axios.get(
      `${url}/test-parameters?integer=not-an-integer&boolean=true`
    );
    assert(false, `Shouldn't have got here.`);
  } catch (err) {
    expect(err.response.data).toEqual({
      errors: {
        required: '"required" is required.',
        integer: '"integer" must be an integer.'
      }
    });
  }
});
