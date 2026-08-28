import { addClearCookie, endpoint, assertSameOrigin, requireMethod, success } from "../../lib/vercel/http.mjs";

export const POST = endpoint(async (request) => {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  return addClearCookie(success({ logged_out: true }));
});
