// The built client bundle is imported into the Worker as a string (wrangler Text rule).
declare module "*.client.js" {
  const content: string;
  export default content;
}
