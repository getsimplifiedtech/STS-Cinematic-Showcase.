// Authenticity of a client-production release (G6-3, APR-JE-040; owner decision D-G62-2, finding RG-14, blocker RB-15).
//
// The owner's rule: a client-production release must eventually require AUTHENTICATED authorisation and independently verifiable BUILD PROVENANCE, and no
// client-production release path may be enabled until that requirement is implemented and independently verified. A JSON record, a commit SHA, a digest or a
// manually supplied CI URL is not proof of authenticity (G6-3-SCOPE.md section 5 evaluates the mechanisms).
//
// So this verifier is a HARD STOP, not a switch. It is code, not a policy value or a file anyone can edit into a pass: it reports "not implemented" for every
// build. check:release refuses a policy that does not require it, and the dry run proves that a build which is green in every other respect is blocked by this
// requirement alone. A work package that implements authenticated authorisation and provenance replaces the body of this function (and its tests) and nothing else.
export const AUTHENTICITY = Object.freeze({ implemented: false });

// ctx is accepted so the future implementation has the candidate digest, the package and the records available; today none of it is trusted.
export function verifyAuthenticity(/* ctx */) {
  return {
    ok: false,
    implemented: AUTHENTICITY.implemented,
    detail: 'authenticated release authorisation and independently verifiable build provenance are not implemented (RG-14, RB-15): a record, a digest, a commit or a CI URL is not proof of who decided or what built the package; no client-production release path exists until this is implemented and independently verified',
  };
}
