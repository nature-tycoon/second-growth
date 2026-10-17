// Derive discovery content from the same authored HTML people read. No browser,
// simulation, network or extra build dependency is needed by GitHub Pages.
export const websiteOrigin = 'https://secondgrowth.earth';
export const publicWebsitePaths = ['/', '/play/', '/visuals.html'];

export function websiteText(html) {
  return html.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&(?:amp|quot|apos|lt|gt|nbsp|#39|#x[\da-f]+|#\d+);/gi, entity => {
    const value = entity.slice(1, -1);
    if (value.startsWith('#')) return String.fromCodePoint(value[1].toLowerCase() === 'x' ? parseInt(value.slice(2), 16) : Number(value.slice(1)));
    return {amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' '}[value.toLowerCase()];
  }).replace(/\s+/g, ' ').trim();
}

export function websiteFacts(homepage) {
  const description = websiteText(homepage.match(/<meta name="description" content="([^"]+)"/)[1]);
  const title = websiteText(homepage.match(/<title>([^<]+)<\/title>/)[1]);
  const maps = [...homepage.matchAll(/<button class="map-choice"[^>]*>/g)].map(([button]) =>
    Object.fromEntries([...button.matchAll(/data-([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, websiteText(value)])));
  const questionsSection = homepage.match(/<div class="questions">([\s\S]*?)<\/div>/)[1];
  const questions = [...questionsSection.matchAll(/<details(?: open)?><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
    .map(([, question, answer]) => ({question: websiteText(question), answer: websiteText(answer)}));
  const modelNote = websiteText(homepage.match(/<aside class="model-note">[\s\S]*?<p>([\s\S]*?)<\/p>/)[1]);
  return {description, title, maps, questions, modelNote};
}

export function websiteDiscovery(homepage) {
  const {description, title, maps, questions, modelNote} = websiteFacts(homepage);
  const home = websiteOrigin + '/', game = home + '#game', site = home + '#website';
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {'@type': 'WebSite', '@id': site, name: 'Second Growth', url: home, inLanguage: 'en'},
      {'@type': 'WebPage', '@id': home + '#webpage', url: home, name: title, description,
        isPartOf: {'@id': site}, mainEntity: {'@id': game}, inLanguage: 'en',
        primaryImageOfPage: {'@type': 'ImageObject', url: home + 'review-media/header-desktop.jpg', width: 2400, height: 1200},
        hasPart: {'@id': home + '#playing'}},
      {'@type': ['VideoGame', 'WebApplication'], '@id': game, name: 'Second Growth', url: home + 'play/', description,
        applicationCategory: 'GameApplication', genre: 'Simulation', gamePlatform: 'Web browser',
        operatingSystem: 'Any operating system with a WebGL-capable browser', browserRequirements: 'Requires a browser with WebGL support',
        inLanguage: 'en', isAccessibleForFree: true, offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD', url: home + 'play/'},
        screenshot: home + 'review-media/header-desktop.jpg', featureList: maps.map(map => map.name + ' landscape')},
      {'@type': 'FAQPage', '@id': home + '#playing', isPartOf: {'@id': home + '#webpage'},
        mainEntity: questions.map(({question, answer}) => ({'@type': 'Question', name: question, acceptedAnswer: {'@type': 'Answer', text: answer}}))},
    ],
  };
  const lines = ['# Second Growth', '', '> ' + description, '', 'Official website: ' + home, '',
    '[Play Second Growth](' + home + 'play/)', '', '## About the game', '',
    'Second Growth is an independent game in active development. Work with habitat conditions and observe ecological processes through play.', '',
    modelNote, '', '## Landscapes', ''];
  for (const map of maps) lines.push('### ' + map.name, '', map.region, '', map.habitat + '.', '', map.copy, '',
    'Species represented: ' + map.species + '.', '', 'Keystone moment: ' + map['moment-title'] + '. ' + map['moment-description'], '');
  lines.push('## Playing Second Growth', '');
  for (const {question, answer} of questions) lines.push('### ' + question, '', answer, '');
  lines.push('## Project and imagery', '', '[Source and feedback](https://github.com/nature-tycoon/second-growth)', '',
    '[Game imagery and capture notes](' + home + 'visuals.html): Staged game scenes and a same-save creek restoration sequence.', '');
  return {schema, markdown: lines.join('\n'), sitemap: '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + publicWebsitePaths.map(path => '  <url><loc>' + websiteOrigin + path + '</loc></url>').join('\n') + '\n</urlset>\n'};
}
