import { TruffleDB } from "truffle-db/db";
import { Compilations, Request, Response } from "./types";

import { generateCompilationsLoad } from "./compilations";
import { generateSourcesLoad } from "./sources";

/**
 * For a compilation result from @truffle/workflow-compile/new, generate a
 * sequence of GraphQL requests to submit to Truffle DB
 *
 * Returns a generator that yields requests to forward to Truffle DB.
 * When calling `.next()` on this generator, pass any/all responses
 * and ultimately returns nothing when complete.
 */
function* generateLoad(
  compilations: Compilations
): Generator<Request, any, Response> {
  const compilationsWithContracts = Object.values(compilations).filter(
    ({ contracts }) => contracts.length > 0
  );

  let loadableCompilations = [];
  for (let compilation of compilationsWithContracts) {
    // add sources for each compilation
    const sources = yield* generateSourcesLoad(compilation);

    // record compilation with its sources
    loadableCompilations.push({ compilation, sources });
  }

  // then add compilations
  return yield* generateCompilationsLoad(loadableCompilations);
}

export async function load(db: TruffleDB, compilations: Compilations) {
  const saga = generateLoad(compilations);

  let cur = saga.next();
  while (!cur.done) {
    // HACK not sure why this is necessary; TS knows we're not done, so
    // cur.value should only ever be Request here (first Generator param),
    // not the return value (second Generator param)
    const { mutation, variables }: Request = cur.value as Request;
    const response: Response = await db.query(mutation, variables);

    cur = saga.next(response);
  }

  return cur.value;
}
