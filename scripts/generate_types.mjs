import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import openapiTS, { astToString } from 'openapi-typescript';
import { compile } from 'json-schema-to-typescript';

const output = process.argv[2];
await mkdir(path.join(output, 'typescript'), { recursive: true });
const openapi = JSON.parse(await readFile(path.join(output, 'openapi.json'), 'utf8'));
await writeFile(path.join(output, 'typescript/api.d.ts'), astToString(await openapiTS(openapi)));
const schema = JSON.parse(await readFile(path.join(output, 'json-schema.json'), 'utf8'));
await writeFile(path.join(output, 'typescript/models.d.ts'), await compile(schema, 'CQAContracts', {
  bannerComment: '/* Generated from cqa_contracts. DO NOT EDIT. */',
  unreachableDefinitions: true,
}));
const submission = JSON.parse(await readFile(path.join(output, 'organizer-results.schema.json'), 'utf8'));
await writeFile(path.join(output, 'typescript/organizer-results.d.ts'), await compile(submission, 'OfficialResults', {
  bannerComment: '/* Generated from cqa_contracts.submission. DO NOT EDIT. */',
}));
