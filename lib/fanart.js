const FanartTvApi = require("fanart.tv-api");
const needle = require('needle');
const urlExists = require("url-exists");
const { cacheWrapImages } = require('./cache');
const { getImdbMapping } = require('./metadataEnrich')
const fanart = new FanartTvApi({ apiKey: process.env.FANART_APIKEY });

const DEFAULT_LOGO_ID = {
  "tt0098492": "28145",
  "892": "127311",
  "tt1118804": "29387",
  "3505": "29388",
  "tt0816407": "55556",
  "3579": "90919",
  "tt5346952": "98545",
  "13701": "98386",
  "tt6153026": "138529",
  "45228": "138478",
  "tt0473578": "32761"
}

async function getImages(kitsuId, type) {
  const mappingInfo = getImdbMapping(kitsuId);
  if (!mappingInfo || (!mappingInfo.imdb_id && !mappingInfo.tmdb_id && !mappingInfo.tvdb_id)) {
    return {};
  }
  const cacheKey = mappingInfo.tmdb_id || mappingInfo.tvdb_id ? kitsuId : mappingInfo.imdb_id;
  return cacheWrapImages(cacheKey, () => retrieveImages(kitsuId, mappingInfo, type));
}

function retrieveImages(kitsuId, mappingInfo, type) {
  return retrieveFanartImages(kitsuId, mappingInfo, type)
      .catch(() => ({}))
      .then(images => retrieveMetahubImages(mappingInfo.imdb_id, images))
}

function retrieveFanartImages(kitsuId, mappingInfo, type) {
  if (type === 'movie' || mappingInfo.tmdb_id) {
    return retrieveMovieImages(kitsuId, mappingInfo);
  }
  return retrieveSeriesImages(kitsuId, mappingInfo)
      .catch(() => retrieveMovieImages(kitsuId, mappingInfo));
}

function retrieveMovieImages(kitsuId, mappingInfo) {
  return fanart.getMovieImages(mappingInfo.tmdb_id || mappingInfo.imdb_id)
      .then(response => ({
        logo: logoUrl(kitsuId, mappingInfo.imdb_id, response.hdmovielogo, response.movielogo),
        poster: firstUrl(response.movieposter),
        background: firstUrl(response.moviebackground)
      }));
}

function retrieveSeriesImages(kitsuId, mappingInfo) {
  return getTvdbId(mappingInfo)
      .then(tvdbId => fanart.getShowImages(tvdbId))
      .then(response => response.thetvdb_id && response.thetvdb_id !== '0' ? response : {})
      .then(response => ({
          logo: logoUrl(kitsuId, mappingInfo.imdb_id, response.hdtvlogo, response.clearlogo),
          poster: firstUrl(response.tvposter),
          background: firstUrl(response.showbackground)
      }));
}

async function retrieveMetahubImages(imdbId, images) {
  if (!images.logo) {
    images.logo = await checkIfExists(`https://images.metahub.space/logo/medium/${imdbId}/img`)
  }
  if (!images.background) {
    images.background = await checkIfExists(`https://images.metahub.space/background/medium/${imdbId}/img`)
  }
  return images
}

async function getTvdbId(mappingInfo) {
  if (mappingInfo.tvdb_id) {
    return mappingInfo.tvdb_id;
  }
  return needle('get', `https://thetvdb.com/api/GetSeriesByRemoteID.php?imdbid=${mappingInfo.imdb_id}`)
      .then(response => response.body?.children?.map(series => series.children[0]?.value))
      .then(seriesIds => seriesIds?.sort((a, b) => a - b)?.[0])
      .then(tvdbId => tvdbId || Promise.reject("no id found"));
}

async function checkIfExists(imdbImage) {
  return new Promise((resolve) => {
    urlExists(imdbImage, (err, exists) => {
      if (exists) {
        resolve(imdbImage)
      } else {
        resolve(undefined);
      }
    })
  });
}

function logoUrl(kitsuId, imdbId, array1 = [], array2 = []) {
  const merged = [].concat(array1).concat(array2);
  const defaultLogoId = DEFAULT_LOGO_ID[kitsuId] || DEFAULT_LOGO_ID[imdbId];
  const defaultLogo = merged.find(e => e.id === defaultLogoId);
  return defaultLogo?.url || firstUrl(merged)
}

function firstUrl(array = []) {
  const entry = array.filter(e => !e.lang || ['en', '00'].includes(e.lang ))[0] || array[0];
  return entry?.url;
}

module.exports = { getImages };