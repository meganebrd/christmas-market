/**
 * Stopwords (normalised: lowercase, no accents, no elision). Removed before BM25 scoring.
 * Question words ("combien", "comment", "quand"…) are stopwords for the search itself:
 * they are read earlier by the intent detector, which works on the full normalised text.
 */
const FR = `
a au aux avec ce ces cet cette ceci cela ca ci de des du d en et ou mais donc or ni car le la les l un une
je j tu il elle on nous vous ils elles me m te t se s moi toi lui leur leurs eux y
mon ma mes ton ta tes son sa ses notre nos votre vos
qui que qu quoi quel quelle quels quelles lequel laquelle lesquels lesquelles dont
est es sont suis sommes etes etre ete ai as avons avez ont avoir eu eue etait etais etaient sera serait seront
fait fais faites faire font faisons fera ferait
peux peut peuvent pouvez pouvons pourrais pourrait
veux veut voulez voudrais voudrait
dois doit devez
va vas vont aller allez
y a il ya
ne pas plus non oui si tres trop bien bon bonne peu beaucoup assez aussi encore deja toujours jamais rien tout tous toute toutes
sur sous dans par pour sans chez vers entre contre pendant avant apres jusque jusqu
ici la-bas voici voila alors puis ensuite enfin comme
combien comment pourquoi quand ou
cest sest quest questce
est-ce
dis dit dire
svp stp please
hein euh bah ben oh ah eh hum hmm
truc trucs chose choses
`;

const EN = `
the a an is are am was were be been do does did you your yours i me my we our it its this that these those
of to in on for with and or but at by from as what which who whom how much many can could would should will
there here have has had any some so if not no yes yeah ok okay please tell about
`;

export const STOPWORDS: ReadonlySet<string> = new Set(
  `${FR} ${EN}`
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean),
);
