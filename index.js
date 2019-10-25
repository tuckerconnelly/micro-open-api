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
const mapValuesDeep = require('map-values-deep');

const ajv = new Ajv({
  allErrors: true,
  verbose: true
});

function validate(schema, rawData) {
  const data = mapValuesDeep(rawData, value =>
    typeof value === 'string' ? _.trim(value) : value
  );

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

      const indefiniteArticle = ['a', 'e', 'i', 'o', 'u'].includes(
        curr.params.type.toLowerCase()[0]
      )
        ? 'an'
        : 'a';

      _.set(
        theNew,
        `${curr.dataPath.slice(1)}`,
        `${_.capitalize(_.startCase(name))} must be ${indefiniteArticle} ${
          curr.params.type
        }.`
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

  return errors;
}

// By default, ignore pathnames with __tests__
const ignorePathnamesWith =
  process.env.MICRO_OPEN_API_IGNORE_PATHNAMES_WITH === undefined
    ? ['__tests__']
    : process.env.MICRO_OPEN_API_IGNORE_PATHNAMES_WITH.split(',').filter(
        p => p
      );

module.exports = function microOpenApi(baseSchema, modulesDir) {
  const schemas = [baseSchema];
  const operations = {};
  debug('Ignore pathnames with: %O', ignorePathnamesWith);

  /*** Load all the schemas and functions ***/

  glob.sync(path.join(modulesDir, '/**/*.js')).forEach(f => {
    if (
      ignorePathnamesWith.reduce((prev, curr) => {
        if (prev) return prev;
        if (f.includes(curr)) return true;
        return false;
      }, false)
    )
      return;

    const module = require(path.resolve(f));
    Object.keys(module).forEach(k => {
      if (k === 'schema') return schemas.push(module[k]);
      if (typeof module[k] === 'function') return (operations[k] = module[k]);
    });
  });
  const schema = schemas.map(yaml.safeLoad).reduce(R.mergeDeepRight);
  debug('Schema: %O', schema);

  /*** Middleware HOF ***/

  return next => async (req, res, ...args) => {
    const parsed = url.parse(req.url);
    debug('Parsed URL: %O', parsed);
    debug('Method: %s', req.method);

    if (parsed.pathname === '/open-api') return schema;

    // Find the schema for the passed pathname and HTTP verb

    const endpointSchema = R.path(
      ['paths', parsed.pathname, req.method.toLowerCase()],
      schema
    );
    debug('Endpoint schema %O', endpointSchema);
    // Continue on if not found
    if (!endpointSchema) return next(req, res, ...args);

    // Find the operation for the passed pathname

    const operation = operations[endpointSchema.operationId];
    // Throw error if not found
    if (!operation)
      throw new Error(`Operation for ${req.method} ${parsed.path} not found.`);

    // Validate the parameters
    const params = qs.parse(url.parse(req.url).query, {
      // Copied from https://github.com/ljharb/qs/issues/91#issuecomment-437926409
      decoder(str, decoder, charset) {
        const strWithoutPlus = str.replace(/\+/g, ' ');
        if (charset === 'iso-8859-1') {
          // unescape never throws, no try...catch needed:
          return strWithoutPlus.replace(/%[0-9a-f]{2}/gi, unescape);
        }

        if (/^(\d+|\d*\.\d+)$/.test(str)) {
          return parseFloat(str);
        }

        const keywords = {
          true: true,
          false: false,
          null: null,
          undefined
        };
        if (str in keywords) {
          return keywords[str];
        }

        // utf-8
        try {
          return decodeURIComponent(strWithoutPlus);
        } catch (e) {
          return strWithoutPlus;
        }
      }
    });
    debug('%O', { params });

    if (endpointSchema.parameters) {
      const errorArray = endpointSchema.parameters
        .map(p => {
          if (!params[p.name] && p.required) {
            return { [p.name]: `"${p.name}" is required.` };
          }

          if (!params[p.name]) return null;

          const errors = validate(p.schema, params[p.name]);

          if (errors) {
            if (errors['']) {
              errors[p.name] = `"${p.name}"${errors['']}`;
              delete errors[''];
            }

            return errors;
          }

          return null;
        })
        .filter(e => e);

      if (errorArray.length) {
        const errors = errorArray.reduce(
          (prev, curr) => ({
            ...prev,
            ...curr
          }),
          {}
        );
        const error = new Error(JSON.stringify({ errors }));
        error.statusCode = 422;
        throw error;
      }
    }

    // If there's no requestBody validation, run the operation
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
        const error = new Error(JSON.stringify({ errors }));
        error.statusCode = 422;
        throw error;
      }

      return operations[endpointSchema.operationId](req, res, ...args);
    }

    throw new Error(
      `Only application/json content type is supported by micro-open-api for requestBody validation. You sent: ${contentType}. Maybe submit a PR?`
    );
  };
};
