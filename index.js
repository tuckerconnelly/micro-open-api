const path = require('path');
const url = require('url');

const debug = require('debug')('micro-open-api');
const Ajv = require('ajv');
const _ = require('lodash');
const qs = require('qs');
const micro = require('micro');
const yaml = require('js-yaml');
const glob = require('glob');
const R = require('ramda');

const ajv = new Ajv({
  allErrors: true,
  verbose: true
});

function validate(schema, data) {
  const valid = ajv.validate(schema, data);
  if (valid) return null;

  // console.log(ajv.errors);

  const errors = ajv.errors.reduce((prev, curr) => {
    const theNew = { ...prev };
    if (curr.keyword === 'required') {
      const dataPath = curr.dataPath
        ? `${curr.dataPath.slice(1)}.${curr.params.missingProperty}`
        : curr.params.missingProperty;
      _.set(
        theNew,
        dataPath,
        `${_.capitalize(_.startCase(curr.params.missingProperty))} is required.`
      );
      return theNew;
    } else if (curr.keyword === 'type') {
      const name = curr.dataPath.split('.').pop();

      _.set(
        theNew,
        `${curr.dataPath.slice(1)}`,
        `${_.capitalize(_.startCase(name))} must be a ${curr.params.type}.`
      );
      return theNew;
    } else if (curr.keyword === 'format') {
      const name = curr.dataPath.split('.').pop();

      _.set(
        theNew,
        `${curr.dataPath.slice(1)}`,
        `${_.capitalize(_.startCase(name))} must be in ${
          curr.params.format
        } format.`
      );
      return theNew;
    } else if (curr.keyword === 'minLength') {
      const name = curr.dataPath.split('.').pop();

      _.set(
        theNew,
        `${curr.dataPath.slice(1)}`,
        `${_.capitalize(_.startCase(name))} must be at least ${
          curr.params.limit
        } characters long.`
      );
      return theNew;
    } else if (curr.keyword === 'maxLength') {
      const name = curr.dataPath.split('.').pop();

      _.set(
        theNew,
        `${curr.dataPath.slice(1)}`,
        `${_.capitalize(_.startCase(name))} must be less than ${
          curr.params.limit
        } characters long.`
      );
      return theNew;
    }

    _.set(
      theNew,
      `${curr.dataPath.slice(1)}`,
      `${_.capitalize(_.startCase(curr.params.missingProperty))} ${
        curr.message
      }`
    );

    return prev;
  }, {});

  return { errors };
}

module.exports = function microOpenApi(baseSchema, modulesDir) {
  const schemas = [baseSchema];
  const operations = {};

  glob.sync(path.join(modulesDir, '/**/*.js')).forEach(f => {
    if (f.includes('__tests__')) return;

    const module = require(path.resolve(f));
    Object.keys(module).forEach(k => {
      if (k === 'schema') return schemas.push(module[k]);
      if (typeof module[k] === 'function') return (operations[k] = module[k]);
    });
  });
  const schema = schemas.map(yaml.safeLoad).reduce(R.mergeDeepRight);

  return next => async (req, res, ...args) => {
    const parsed = url.parse(req.url);
    debug('%O', { parsed });

    const endpointSchema = R.path(
      ['paths', parsed.pathname, req.method.toLowerCase()],
      schema
    );
    if (!endpointSchema) return next(req, res, ...args);

    const operation = operations[endpointSchema.operationId];
    if (!operation)
      throw new Error(`Operation for ${req.method} ${parsed.path} not found.`);

    const params = qs.parse(url.parse(req.url).query);

    debug('%O', { params });

    if (!endpointSchema.requestBody) return operation(req, res, ...args);

    const contentType = req.headers['content-type']
      ? req.headers['content-type'].split(';')[0]
      : 'application/json';

    if (!R.path(['requestBody', 'content', contentType], endpointSchema)) {
      if (R.path(['requestBody', 'required'], endpointSchema)) {
        const error = new Error(
          JSON.stringify({
            ok: false,
            errors: {
              general: `Invalid request body. Did you send the right content-type header?`
            }
          })
        );
        error.statusCode = 400;
        throw error;
      }
      return next(req, res, ...args);
    }

    if (contentType === 'application/json') {
      const errors = validate(
        endpointSchema.requestBody.content[contentType].schema,
        await micro.json(req)
      );

      if (errors) {
        const error = new Error(JSON.stringify(errors));
        error.statusCode = 422;
        throw error;
      }

      return operations[endpointSchema.operationId](req, res, ...args);
    }

    throw new Error(
      `Only application/json content type supported by micro-open-api, sorry. You sent: ${contentType}`
    );
  };
};
