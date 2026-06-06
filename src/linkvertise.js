const config = require('./config');

function makeLinkvertiseUrl(destinationUrl) {
  if (!config.linkvertiseUserId) {
    throw new Error('Missing LINKVERTISE_USER_ID');
  }

  const encoded = Buffer.from(destinationUrl).toString('base64');
  const randomPath = (Math.random() * 1000).toFixed(12);

  return `https://link-to.net/${config.linkvertiseUserId}/${randomPath}/dynamic?r=${encodeURIComponent(encoded)}`;
}

module.exports = {
  makeLinkvertiseUrl
};
