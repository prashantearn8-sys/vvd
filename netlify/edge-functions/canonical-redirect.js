export default async (request, context) => {
  const url = new URL(request.url);

  // Permanently 301-redirect any *.netlify.app subdomain to the primary custom domain
  if (url.hostname.endsWith(".netlify.app")) {
    const destination = `https://monotranscoder.runs-on.dev${url.pathname}${url.search}`;
    return Response.redirect(destination, 301);
  }

  return context.next();
};
