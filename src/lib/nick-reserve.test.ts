import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nickReissueAllowed } from "./nick-reserve.ts";

describe("nick reissue flag", () => {
  it("defaults to no reissue and is only enabled with an explicit true value", () => {
    const prev = process.env.AMR_NICK_REISSUE;
    delete process.env.AMR_NICK_REISSUE;
    assert.equal(nickReissueAllowed(), false);
    process.env.AMR_NICK_REISSUE = "false";
    assert.equal(nickReissueAllowed(), false);
    process.env.AMR_NICK_REISSUE = "true";
    assert.equal(nickReissueAllowed(), true);
    if (prev === undefined) delete process.env.AMR_NICK_REISSUE;
    else process.env.AMR_NICK_REISSUE = prev;
  });
});
