// Spanish for the Chinandega map's own content: plants, animals, seed mixes, the map's story and
// rules, its tools, moments and campaign chapters. Applied when the map loads in Spanish.
// Written in the Spanish of Nicaragua, with local names for plants and animals.
import { lang, addPatterns, addStrings, tr } from '../i18n.js';
import { TOOLS, CATEGORIES, PLANT_TABS } from '../tools.js';
import { FEATURE_NAMES } from '../config.js';
import { LAYER_NAMES } from '../data/plants.js';
import { BIOMES, onBiome } from '../biome.js';
import { CHAPTERS } from '../sim/campaign.js';

const PLANTS = {
  jaragua: ['Zacate jaragua', 'INVASORA. Un pasto africano que crece hasta la cabeza, se seca cada verano y arde con fuerza. Cada incendio mata los árboles jóvenes y deja entrar más jaragua. La sombra de los árboles es lo que al final lo vence.'],
  guinea: ['Zacate guinea', 'INVASORA. Otro pasto africano, espeso a la orilla de los caminos y en los potreros viejos. Crece hasta en la media sombra.'],
  paspalum: ['Grama', 'Un zacate nativo y bajo que sujeta la tierra desnuda y alimenta a los venados y garrobos.'],
  dormilona: ['Dormilona', 'Sus hojas se cierran cuando las tocás. Una leguminosa resistente que le devuelve el nitrógeno a la tierra cansada.'],
  tithonia: ['Jalacate', 'Grandes flores anaranjadas al final de las lluvias, llenas de néctar para mariposas y colibríes.'],
  cosmos: ['Flor de muerto', 'Una flor silvestre nativa y rápida para la tierra seca y pelada. Las abejas y mariposas la visitan toda la temporada de lluvias.'],
  salvia: ['Salvia roja', 'Flores escarlatas casi todo el año, de las favoritas de los colibríes.'],
  heliconia: ['Platanillo', 'Hojas grandes y espigas de flores anaranjadas en la sombra húmeda de la quebrada.'],
  pescaprae: ['Riñonina', 'Un bejuco que corre por la parte de atrás de la playa y sujeta las dunas. La arena abierta de enfrente, hasta las olas, es donde anidan las tortugas marinas.'],
  leatherfern: ['Helecho de manglar', 'Un helecho gigante del lodo salado a la orilla de los manglares.'],
  lantana: ['Cinco negritos', 'Nativa de aquí, con ramilletes de flores anaranjadas y amarillas que encantan a las mariposas, y frutitos para los pájaros.'],
  hamelia: ['Coralillo', 'Flores rojas en forma de tubo casi todo el año para los colibríes, y frutitos para guardabarrancos y tangaras.'],
  cornizuelo: ['Cornizuelo', 'Sus espinas grandes y huecas son la casa de unas hormiguitas bravas que lo defienden de cualquier animal que se lo quiera comer.'],
  seagrape: ['Uva de playa', 'Hojas redondas y duras en la parte alta de la playa. Da sombra a la arena y protege las dunas.'],
  castor: ['Higuerilla', 'INVASORA. Se apodera de la tierra alterada a la orilla de caminos, corrales y potreros sobrepastoreados. Sus semillas son venenosas.'],
  guanacaste: ['Guanacaste', 'El guanacaste, o "árbol de orejas" por sus vainas en forma de oreja. El árbol de sombra más grande de la costa del Pacífico; sus vainas alimentan venados, chanchos de monte y ganado.'],
  genizaro: ['Genízaro', 'Un árbol enorme como una sombrilla, cuyas hojas se cierran de noche y antes de la lluvia. Sus flores rosadas como pompones alimentan a murciélagos y polillas.'],
  ceiba: ['Ceiba', 'La gigante del bosque, con sus raíces como paredes. Sus flores se abren de noche para los murciélagos, y sus semillas se van volando en su algodón de seda.'],
  madrono: ['Madroño', 'El árbol nacional de Nicaragua. Se cubre de flores blancas en Navidad, y su corteza anaranjada se pela y queda lisa.'],
  cortes: ['Cortés', 'En las semanas más secas del año, sin una sola hoja, revienta en flores de un amarillo dorado por unos pocos días.'],
  macuelizo: ['Roble macuelizo', 'Sin hojas y cubierto de flores rosadas en forma de trompeta en marzo y abril, lleno de abejas y colibríes.'],
  madero: ['Madero negro', 'Los campesinos clavan ramas cortadas en la tierra y pegan raíces como "cerca viva". Fija nitrógeno, y sus flores rosadas salen en el verano.'],
  guacimo: ['Guácimo', 'Un árbol pionero rápido y resistente de los potreros viejos. Sus frutos duros y negros alimentan a venados, garrobos y loras en el verano.'],
  jinocuabo: ['Jiñocuabo', 'El jiñocuabo, o "palo de turista", por su corteza roja que se pela. Sus frutitos rojos alimentan a muchísimas clases de pájaros.'],
  jicaro: ['Jícaro', 'Sus frutos redondos y duros crecen pegados al tronco; con las semillas se hace la semilla de jícaro, y los caballos quiebran los frutos.'],
  chilamate: ['Chilamate', 'Una gran higuera a la orilla de la quebrada, verde todo el año. Siempre hay algo en fruta, y los monos, murciélagos y loras vienen de lejos a comer.'],
  redmangrove: ['Mangle rojo', 'Se para sobre raíces arqueadas como zancos en el agua salada. Peces, camarones y cangrejos crecen entre sus raíces antes de salir al mar.'],
  blackmangrove: ['Mangle negro', 'Crece un poco más arriba en el lodo, y respira por miles de raicitas como lápices que salen del lodo.'],
  whitemangrove: ['Mangle blanco', 'El manglar que vuelve más rápido a la orilla de las camaroneras abiertas y los lodazales.'],
  neem: ['Nim', 'INVASORA. El nim, traído de la India para sombra y medicina, ahora se riega solo por todas partes y le quita la luz al bosque seco nativo.'],
};
const MIXES = {
  mix_groundcover: ['Cobertura de suelo', 'Un zacate nativo bajo, una leguminosa que fija nitrógeno y una flor silvestre rápida para cubrir y alimentar el potrero cansado.'],
  mix_flowers: ['Jardín de mariposas', 'Flores nativas para mariposas, abejas y colibríes durante toda la temporada de lluvias.'],
  mix_beach: ['Plantas de playa', 'Riñonina para sujetar la arena donde anidan las tortugas marinas.'],
  mix_mangrovefloor: ['Orilla del manglar', 'Helecho de manglar para el lodo salado a la orilla de los manglares.'],
  mix_shrubs: ['Arbustos del bosque seco', 'Arbustos nativos con flores y frutas, para refugio y comida.'],
  mix_livingfence: ['Cerca viva', 'Madero negro y jiñocuabo, los árboles que los campesinos nicaragüenses siembran como cercas vivas. Unen los parches de bosque como un seto. Pintá a lo largo de una cerca de alambre y queda una estaca en cada poste, en una línea seguida.'],
  mix_dryforest: ['Bosque seco', 'Los árboles del bosque seco tropical: guanacaste, genízaro, madroño, cortés y ceiba, con guácimo rápido para darle sombra al zacate.'],
  mix_riverside: ['Árboles de quebrada', 'Higueras siempre verdes y árboles grandes para las orillas de la quebrada.'],
  mix_mangrove: ['Manglares', 'Mangle rojo, negro y blanco para el estero y el lodo. Cada uno busca el nivel de agua que le gusta.'],
};
// name, one, many, description, hint
const ANIMALS = {
  cattle: ['Ganado brahman', 'vaca', 'vacas', 'El hato de la cooperativa: vacas brahman, blancas y resistentes al calor. Con árboles de sombra y cercas vivas en el potrero pasan frescas el verano, dan más leche y comparten la finca con los animales silvestres en vez de sacarlos.', 'Potrero con árboles de sombra: silvopastoreo.'],
  congo: ['Mono congo', 'mono congo', 'monos congos', 'Su rugido al amanecer se oye a kilómetros. Come hojas y nunca baja al suelo, así que solo puede vivir donde las copas de los árboles se juntan.', 'Bosque seco alto con copas conectadas, unido al bosque del volcán.'],
  capuchin: ['Mono cara blanca', 'mono cara blanca', 'monos cara blanca', 'Un mono listo y bullicioso que come frutas, insectos y huevos, y usa piedras como herramientas.', 'Parches grandes de bosque seco con árboles frutales.'],
  deer: ['Venado cola blanca', 'venado', 'venados', 'Casi desapareció del Pacífico por la cacería. Ramonea en la orilla del bosque y come frutos de guanacaste y guácimo.', 'Bosque seco junto a terreno abierto, con árboles frutales.'],
  coati: ['Pizote', 'pizote', 'pizotes', 'Manadas de hembras y crías recorren el suelo del bosque con la cola parada, escarbando en busca de insectos y frutas.', 'Bosque con frutas y hojarasca.'],
  armadillo: ['Cusuco', 'cusuco', 'cusucos', 'De noche escarba buscando hormigas y gusanos, y siempre tiene cuatro crías idénticas.', 'Tierra suave y llena de insectos bajo arbustos y árboles.'],
  agouti: ['Guatusa', 'guatusa', 'guatusas', 'Entierra semillas para comerlas después y se le olvidan muchas, sembrando el bosque del futuro.', 'Bosque con muchas frutas y semillas caídas.'],
  raccoon: ['Mapache cangrejero', 'mapache', 'mapaches', 'Caza cangrejos entre las raíces del manglar cuando baja la marea.', 'Manglares y lodo del estero llenos de cangrejos.'],
  ocelot: ['Tigrillo', 'tigrillo', 'tigrillos', 'Un gato manchado muy bonito que caza guatusas y garrobos de noche. Si vuelve, quiere decir que el bosque está grande y entero otra vez.', 'Mucho bosque seco conectado, con guatusas y garrobos.'],
  bat: ['Murciélago frutero', 'murciélago frutero', 'murciélagos fruteros', 'Se lleva los higos para comérselos y bota las semillas lejos, en el terreno abierto: uno de los mejores sembradores de árboles que hay.', 'Árboles con fruta, sobre todo higueras.'],
  motmot: ['Guardabarranco', 'guardabarranco', 'guardabarrancos', 'El ave nacional de Nicaragua. Mueve su cola con raquetas como un péndulo y anida en túneles que escarba en los barrancos de las quebradas.', 'Bosque seco cerca de barrancos de quebrada, con muchos insectos, y una quebrada con sombra en sus orillas (por lo menos una quinta parte, mejor si es más).'],
  lora: ['Lora nuca amarilla', 'lora', 'loras', 'Una lora que habla, tan sacada de sus nidos para mascota que ahora está en peligro crítico. Anida en huecos de árboles grandes y viejos.', 'Árboles grandes y viejos con huecos para anidar, y bosque seco con frutas.'],
  chocoyo: ['Chocoyo', 'chocoyo', 'chocoyos', 'Bandadas bulliciosas de periquitos verdes que hacen sus nidos dentro de los comejenes de los árboles.', 'Árboles con frutas, flores y semillas.'],
  urraca: ['Urraca', 'urraca', 'urracas', 'Una urraca bulliciosa, azul y blanca, con un copete rizado y una cola larguísima, siempre en pandilla.', 'Bosque seco abierto y orillas del bosque.'],
  hummingbird: ['Colibrí canelo', 'colibrí canelo', 'colibríes canelos', 'Se alimenta del coralillo, la salvia y las flores de los árboles en el verano.', 'Flores todo el año: coralillo, salvia y árboles en flor.'],
  spoonbill: ['Garza rosada', 'garza rosada', 'garzas rosadas', 'Barre las aguas bajas con su pico en forma de cuchara buscando camarones, que son los que la vuelven rosada.', 'Lodazales de marea donde se rompieron y vaciaron camaroneras viejas, con manglares alrededor.'],
  egret: ['Garza blanca', 'garza blanca', 'garzas blancas', 'Acecha peces y cangrejos en las aguas bajas y duerme en los manglares de noche.', 'Aguas bajas, manglares y el estero.'],
  guaco: ['Guaco', 'guaco', 'guacos', 'Un halcón que caza culebras, y cuyo canto fuerte, "guaco, guaco", dice la gente que trae la lluvia.', 'Árboles altos a la orilla del bosque, con culebras para cazar.'],
  iguana: ['Garrobo verde', 'garrobo verde', 'garrobos verdes', 'Come hojas en lo alto de los árboles junto al agua y se tira al agua cuando hay peligro. Por la cacería se ha vuelto escaso.', 'Árboles a la orilla de la quebrada y el estero.'],
  ctenosaur: ['Garrobo negro', 'garrobo negro', 'garrobos negros', 'Toma el sol sobre piedras y cercas viejas, y es la lagartija más rápida del mundo en tierra.', 'Piedras, troncos y arbustos al sol.'],
  boa: ['Boa', 'boa', 'boas', 'Grande e inofensiva para la gente, controla los ratones alrededor de las fincas.', 'Bosque y arbustos con animalitos para comer.'],
  crocodile: ['Cocodrilo', 'cocodrilo', 'cocodrilos', 'Toma el sol en los bancos de lodo del estero. Es tímido, y lo han cazado en casi toda la costa.', 'Un estero ancho y tranquilo con manglares.'],
  seaturtle: ['Tortuga paslama', 'paslama', 'paslamas', 'De julio a diciembre las hembras suben a la playa de noche a escarbar un nido y poner unos 100 huevos. La hueveada, los perros y las luces las espantan.', 'Una playa tranquila con arena y plantas de duna, sin senderos ni edificios cerca. Llegan de julio a noviembre.'],
  snook: ['Róbalo', 'róbalo', 'róbalos', 'Los pequeños crecen escondidos entre las raíces del manglar; los grandes alimentan a las familias de toda la costa.', 'Canales de manglar conectados al estero.'],
  snapper: ['Pargo', 'pargo', 'pargos', 'Otro pez que necesita el manglar como criadero antes de salir a los arrecifes.', 'Canales de manglar limpios.'],
};

const MAP = {
  name: 'Nicaragua',
  region: 'Chinandega, Nicaragua',
  blurb: 'Una finca ganadera que baja de las faldas del volcán San Cristóbal hasta el Pacífico: potreros quemados donde estaba el bosque seco, una quebrada pelada, camaroneras en el manglar y una playa que las tortugas dejaron de usar.',
  startText: 'Es verano, Año 1. Los potreros están cafés, las vacas se amontonan bajo los pocos árboles de sombra, el humo de las quemas de los vecinos baja del volcán, y la quebrada ya solo tiene unas pocas pozas. En la playa no ha anidado nada en años.',
  story: '<p><b>Una cooperativa de Chinandega se hizo cargo de la Finca El Guanacaste</b>, y te pidió ayuda para recuperarla. Antes, el bosque seco tropical cubría estas faldas, desde el volcán San Cristóbal hasta el Pacífico. Lo despalaron para sembrar algodón en los años cincuenta. La tierra negra volcánica de aquí es de las más ricas de Centroamérica, pero décadas de venenos, quemas y erosión le quitaron la capa de arriba; después se volvió potrero, quemado cada verano, casi sin un árbol de sombra. En la costa cavaron camaroneras en el manglar, y las tortugas dejaron de anidar en la playa. Las familias de la cooperativa crían ganado y quieren seguir haciéndolo, pero de una forma que también traiga de vuelta el bosque, el agua y los animales.</p>',
  campaignEnd: 'Terminaste la campaña. La Finca El Guanacaste va desde el bosque del volcán, pasando por potreros con sombra y cercas vivas, hasta los manglares y una playa de tortugas, y el hato está más sano por eso. Todas las herramientas son tuyas: seguí todo el tiempo que querás.',
  rules: [
    'No comprás animales ni mejoras. <b>Creás hábitat</b>, y los animales siguen sus propias reglas: vienen del bosque del volcán, del estero y del mar cuando hay lugar, crían, y se van cuando no hay suficiente.',
    '<b>Tierra volcánica rica.</b> La tierra negra de la ceniza del San Cristóbal es fértil por naturaleza. Si la cubrís con plantas y sombra se cura rápido; si la dejás pelada y quemada, las lluvias la lavan de las laderas.',
    '<b>Dos estaciones.</b> De mayo a octubre llueve; de noviembre a abril casi no llueve, y la mayoría de los árboles del bosque seco botan las hojas. Sembrá al empezar las lluvias, para que los arbolitos tengan seis meses de crecer raíces antes del verano.',
    '<b>El hato</b> es parte de la finca. Al ganado le va mejor con árboles en el potrero: la sombra lo mantiene fresco en el verano y da más leche, lo que le paga a la cooperativa cada mes. Eso es silvopastoreo. Pero las vacas se comen los arbolitos, así que sembrá en rincones protegidos o detrás de cercas vivas.',
    '<b>El fuego es el enemigo del bosque seco.</b> El jaragua y el guinea se secan cada año y arden con fuerza, y los potreros se queman cada verano. Las rondas, las cuadrillas de bomberos y la sombra de los árboles ayudan.',
    '<b>Las cercas vivas</b> de madero negro y jiñocuabo unen los parches de bosque, para que los monos, los pájaros y las semillas puedan pasar de uno a otro.',
    '<b>Los manglares</b> son el criadero de los peces, camarones y conchas negras de toda la costa, y los pescadores y las concheras ganan más cada mes cuando vuelven. Rompé los bordos de las camaroneras viejas para que entre la marea, y el manglar vuelve casi solo.',
    '<b>La playa</b> es donde anidan las tortugas paslama de julio a noviembre. Necesitan arena tranquila y oscura con plantas de duna detrás, lejos de senderos y edificios.',
    '<b>La finca se mantiene sola.</b> Cada mes la cooperativa vende leche y queso, y los pescadores y las concheras venden pescado y conchas negras. La sombra en el potrero sube lo primero, y los manglares suben lo segundo. Una pequeña ayuda de conservación también ayuda.',
  ],
  firstYear: [
    'Sembrá <b>árboles de sombra</b> en los potreros (guanacaste, genízaro, guácimo) y <b>cercas vivas</b> en las líneas de los potreros, al empezar las lluvias en mayo.',
    'Dejá que la tierra empinada de la <b>falda del volcán</b> vuelva a ser <b>bosque seco</b>, y arrancá el <b>jaragua</b> de ahí.',
    'Sembrá <b>árboles de quebrada</b> en la orilla para darle sombra.',
    'En la costa, <b>rompé un bordo de camaronera</b> (Quitar → Demoler) junto a los manglares viejos, y sembrá <b>plantas de playa</b> en las dunas.',
  ],
  seasons: ['Final del verano', 'Invierno', 'Final del invierno', 'Verano'],
  tips: [
    'Final del verano: las semanas más calientes y secas, hasta que las primeras lluvias de mayo lo ponen todo verde. Sembrá cuando empiecen las lluvias.',
    'Invierno: caliente y húmedo, con un veranillo corto (la canícula) en julio. Las tortugas empiezan a anidar.',
    'Final del invierno: las tormentas más fuertes, y la quebrada corre llena. Las tortuguitas salen hacia el mar.',
    'Verano: casi nada de lluvia por meses. Los árboles botan las hojas, el zacate se seca, y el peligro es el fuego.',
  ],
  fireCause: ['Un vecino que quemó su potrero para que retoñe el zacate', 'Una chispa de un camión que pasaba', 'Alguien que quemó basura a la orilla del camino'],
  text: {
    edges: { N: 'las faldas del San Cristóbal al norte', E: 'los manglares del estero al este', S: 'el estero y el mar', W: 'el potrero de los vecinos al oeste' },
    creekFish: 'róbalos', culvertBlocks: 'los peces del estero', fenceBlocks: 'los venados',
    flood: '¡La quebrada se crece!',
    floodOut: 'Tierra nueva cubre las partes bajas, y en ella nacen mangles e higueras.',
    fireOutRain: 'La primera lluvia lo apagó. Los zacates nativos retoñan de la raíz; los arbolitos tardan más.',
    fireOut: 'El jaragua volverá primero, a menos que los árboles le den sombra.',
    crownOut: 'Los árboles muertos en pie servirán a pájaros carpinteros y loras mientras vuelve el bosque.',
  },
  structureNames: { house: 'Casa de la cooperativa', barn: 'Corral y lechería', silo: 'Pila de agua', shed: 'Bodega', tractor: 'Carreta de bueyes', parking: 'Parqueo', center: 'Centro de visitantes' },
  habitatNames: {
    FARM: 'Potrero', INVASIVE: 'Zacate jaragua', MEADOW: 'Zacate nativo y flores', SHRUB: 'Monte bajo', YOUNG_FOREST: 'Bosque seco joven',
    MATURE_FOREST: 'Bosque seco viejo', RIPARIAN: 'Bosque de galería', MARSH: 'Manglar y estero', POND: 'Laguna', CREEK: 'Quebrada y canales', RIVER: 'Estero', BARE: 'Tierra pelada', DEVELOPED: 'Construcciones y caminos',
  },
  terrainNames: { PASTURE: 'Potrero', FIELD: 'Campo arado', SOIL: 'Tierra pelada y quemada', GRAVEL: 'Arena de playa', MUD: 'Lodo', MARSH: 'Estero', POND: 'Camaronera', CREEK: 'Quebrada', RIVER: 'Estero', ROAD: 'Camino de la finca', DUFF: 'Suelo del bosque', TRAIL: 'Sendero' },
  toolText: {
    pull: { desc: 'Arrancá el jaragua, el guinea, la higuerilla y los arbolitos de nim. Las plantas nativas se quedan.' },
    marsh: { desc: 'Cavá estero en tierra baja y húmeda. Los mangles pueden crecer en él.' },
    clear: { desc: 'Dejá un cuadro en tierra pelada: jaragua, lo que tenga. Después sembrá nativas.' },
    burn: { desc: 'Una quema temprana y cuidadosa limpia el jaragua antes de que se acumule. Hacela lejos de los árboles jóvenes. Con tiempo seco se puede escapar: hacé una ronda alrededor primero.' },
    demolish: { desc: 'Quitá cercas, edificios viejos, caminos, la alcantarilla, o un bordo de camaronera (romper un bordo deja entrar la marea a la camaronera).' },
  },
  moments: {
    hatchlings: { title: 'Las tortuguitas corren al mar', text: 'Semanas después de que una paslama subió a la playa a poner sus huevos, las crías escarbaron juntas hasta salir de la arena y corren hacia las olas. Solo una de cada mil llegará a grande, y las que lo logren volverán a esta misma playa a anidar.' },
    congos: { title: 'Volvieron los monos congos', text: 'Una manada de monos congos llegó desde el volcán por las copas de los árboles, y al amanecer se oye su rugido por toda la finca. El bosque que sembraste es suficientemente grande, y está suficientemente conectado, para que vivan aquí otra vez.' },
    arribada: { title: 'Las tortugas salen a la playa', text: 'En una noche oscura del invierno, una tras otra, las paslamas salieron de las olas por toda la playa. Cada una escarba un hueco en la arena con las aletas de atrás, pone unos cien huevos, lo tapa, y se arrastra de vuelta al mar antes del amanecer. Mantené la playa tranquila y oscura, y en seis semanas nacerán.' },
  },
};

// The eight campaign chapters, in order: title, story, teach, and the goal texts.
const CHAPTERS_ES = [
  ['Sombra para el hato',
    'Las vacas de la cooperativa se pasan todo el verano al sol, amontonadas bajo los últimos guanacastes. Bajan de peso y dan poca leche. El primer trabajo es la sombra: árboles creciendo en el mismo potrero, como lo hacían los viejos.',
    'Usá <b>Inspeccionar</b> para tocar una vaca, un árbol o el zacate. Después sembrá <b>Sembrar → Árboles → Bosque seco</b> en puntos regados por los potreros. Los árboles tardan como un año en crecer lo suficiente para darle sombra al zacate; la plata de la leche sube a medida que se extiende la sombra. Mientras tanto, regá <b>Sembrar → Mezclas de semillas → Cobertura de suelo</b> sobre los parches pelados y quemados: se ponen verdes en unas semanas y empiezan a curar la tierra.',
    ['Inspeccioná un cuadro o un animal', 'Sembrá 100 árboles en los potreros', 'Regá Cobertura de suelo en 80 cuadros de tierra pelada y quemada']],
  ['Cercas vivas',
    'Alambre de púas en postes muertos divide los potreros. Los campesinos de aquí siempre han conocido algo mejor: cortás una rama de madero negro, la clavás en la tierra, y pega raíces y crece como un poste vivo. Una línea de ellos se vuelve un seto por donde pueden pasar pájaros y monos.',
    'Sembrá <b>Sembrar → Árboles → Cerca viva</b> justo en las líneas de alambre entre los potreros: las estacas pegan como postes. Las vacas no alcanzan los arbolitos sembrados en la línea de la cerca. <b>Quitar → Arrancar invasoras</b> limpia el jaragua, y la <b>Cobertura de suelo</b> regada en la tierra pelada que queda no deja que el jaragua vuelva enseguida. Los árboles de sombra del capítulo 1 siguen creciendo mientras trabajás, y cuentan para la meta de sombra.',
    ['Sembrá 120 árboles de cerca viva', 'Arrancá el jaragua y regá Cobertura de suelo donde lo arrancaste, en 150 cuadros', 'Dale sombra a 250 cuadros más de potrero: los árboles del capítulo 1 lo logran cuando están a medio crecer']],
  ['La quebrada',
    'La quebrada baja del volcán y se seca en febrero. Las vacas toman agua de ella y pisotean sus orillas peladas hasta volverlas lodo, y una alcantarilla bajo el camino de la finca no deja que los peces suban del estero en el invierno.',
    '<b>Demolé</b> la alcantarilla donde el camino de la finca cruza la quebrada. Sembrá <b>Árboles de quebrada</b> y <b>Arbustos del bosque seco</b> en las orillas. La sombra mantiene el agua en las pozas más tiempo en el verano, y el guardabarranco anida en barrancos con sombra.',
    ['Quitá la alcantarilla de la quebrada', 'Sembrá 50 arbustos o árboles junto a la quebrada', 'El guardabarranco anida en la finca']],
  ['Volcán arriba',
    'La parte alta de la finca sube por las faldas del San Cristóbal. Es muy empinada para el ganado y se quema cada año, y con cada tormenta su tierra negra volcánica se lava del cerro. Si le das una oportunidad, el bosque seco vuelve rápido aquí: es de la tierra más rica del país.',
    'La pestaña de <b>Árboles</b> está abierta. Sembrá <b>Bosque seco</b> en bloques en la tierra empinada del norte, y dejá que la falda se enmonte. Sembrá <b>Jardín de mariposas</b> en los claros. Los árboles grandes creciendo juntos forman el bosque que necesitan los monos y las loras.',
    ['Sembrá 200 árboles más, en bloques en la falda del volcán', 'Hacé crecer 300 cuadros más de bosque seco en la falda del volcán', 'Regá Jardín de mariposas en 60 cuadros']],
  ['La temporada de quemas',
    'Desde ahora el verano trae fuego. Los vecinos queman sus potreros para que retoñe el zacate, el jaragua se seca como yesca, y una chispa puede correr por toda la finca y matar los árboles jóvenes. El bosque seco aguanta el fuego de vez en cuando, pero no cada año.',
    '<b>Limpiar vegetación</b> hace rondas alrededor de los árboles jóvenes. Una <b>quema controlada</b> al inicio del verano limpia el jaragua antes de que se acumule, pero con tiempo seco se puede escapar, así que hacé una ronda alrededor primero. Cuando venga un incendio, mandá una <b>cuadrilla de bomberos</b>. La sombra es la cura que dura: el jaragua no crece bajo los árboles.',
    ['Hacé 40 cuadros de ronda (Limpiar vegetación)', 'Hacé crecer 300 cuadros más de bosque seco', 'Subí 8 puntos la salud del ecosistema']],
  ['Que vuelva la marea',
    'En la costa cavaron camaroneras en el manglar y las cerraron con bordos de lodo. Los pescadores y las mujeres que recogen conchas negras entre las raíces del manglar sacan menos cada año. Rompé los bordos y la marea traerá el manglar de vuelta sola.',
    '<b>Demolé</b> un pedazo de bordo para abrir una camaronera. La marea entra y sale, la camaronera se vacía hasta quedar lodo, y las semillas de mangle llegan flotando y pegan, más rápido junto a los manglares viejos. Sembrar <b>Manglares</b> en las camaroneras vaciadas los hace crecer mucho más rápido, y abrir más de una camaronera ayuda. La plata de la pesca sube con cada cuadro de manglar.',
    ['Rompé 12 cuadros de bordo de camaronera', 'Lográ que crezcan 60 mangles donde estaban las camaroneras', 'Las garzas rosadas comen en las camaroneras vaciadas']],
  ['La playa de las tortugas',
    'Hace años que ninguna tortuga anida en la playa de la finca. Las dunas están peladas, los perros y las luces espantan a las tortugas, y la gente se lleva los huevos. Las paslamas volverán a una playa tranquila y oscura, con plantas que sujeten las dunas detrás.',
    'Sembrá <b>Plantas de playa</b> en las dunas de atrás, y dejá limpia la arena abierta junto a las olas: ahí es donde escarban las tortugas. Mantené la playa oscura y tranquila, y arrancá la higuerilla y el jaragua de las dunas.',
    ['Regá Plantas de playa en 40 cuadros de las dunas', 'Las tortugas salen a anidar', 'Las tortuguitas llegan al mar']],
  ['Del volcán al mar',
    'La finca está unida otra vez: bosque en el volcán, sombra y cercas vivas en los potreros, una quebrada verde, manglares y una playa de tortugas. Ahora pueden volver los animales que necesitan todo eso junto, y algunos necesitan un poco de ayuda.',
    'Las herramientas de <b>Animales</b> pueden traer monos congos del bosque del volcán. Cada uno necesita primero el hábitat correcto; la herramienta te dice qué necesita. Cuidá también el hato: una finca que alimenta a sus familias y a sus animales silvestres es de eso que se trata.',
    ['Los monos congos crían en el bosque', 'Hacé crecer 250 cuadros más de bosque seco, uniendo los parches', 'Subí $1,500 al mes la plata de la leche y la pesca']],
];

// name, description, and how the progress line reads
const GOALS = {
  plant: ['Primeros árboles', 'Sembrá 200 plantas nativas en cualquier parte de la finca.'],
  livingfence: ['Cercas vivas', 'Sembrá 100 árboles de cerca viva (Sembrar → Árboles → Cerca viva). Las líneas de madero negro y jiñocuabo en las orillas de los potreros unen los parches de bosque.'],
  culvert: ['Liberá la quebrada', 'Quitá la alcantarilla donde el camino de la finca cruza la quebrada, para que los peces puedan subir del estero en el invierno.'],
  silvo: ['Sombra para el hato', 'Hacé crecer árboles en el potrero para que 1,000 cuadros más de pasto tengan sombra cerca. Eso es silvopastoreo: las vacas pasan frescas, dan más leche, y los animales silvestres pueden cruzar la finca.'],
  herd: ['Un hato sano', 'Vendé $1,500 de leche y queso en un mes. Las vacas con buena sombra dan mucha más leche, así que se necesitan árboles de sombra en el potrero además de un buen hato.'],
  shade: ['Una quebrada con sombra', 'Sembrá árboles y arbustos en la mitad de la quebrada. La sombra mantiene el agua más tiempo en el verano.'],
  ponds: ['Abrí las camaroneras', 'Rompé los bordos de las camaroneras viejas (Quitar → Demoler un bordo) para que la marea vuelva a entrar. Las camaroneras se vacían hasta quedar lodo, y los mangles nacen solos. Bajá el agua de camaronera a menos de 60 cuadros.'],
  mangroves: ['Vuelven los manglares', 'Lográ que crezcan 150 mangles donde estaban las camaroneras. Cuando corre la marea, las semillas de mangle llegan solas desde los manglares viejos; sembrar mangle rojo, negro y blanco lo apura.'],
  dunes: ['Sujetá las dunas', 'Hacé crecer riñonina o uva de playa en 25 cuadros de las dunas de atrás de la playa. Sujetan la arena donde anidan las tortugas.'],
  weeds: ['Vencé al jaragua', 'Bajá las plantas invasoras a menos del 25% del terreno. El jaragua y el guinea se queman cada verano; la sombra de los árboles jóvenes es lo que al final los mata.'],
  firesafe: ['Un verano sin fuego', 'Pasá un verano entero (de enero a abril) sin fuego en la finca. Aquí el potrero se quema cada año; las rondas, las cuadrillas de bomberos y los árboles de sombra sobre el zacate ayudan.'],
  forest: ['Bosque seco', 'Hacé crecer 600 cuadros de bosque seco.'],
  motmot: ['Guardabarranco', 'El guardabarranco, el ave nacional de Nicaragua, anida en la finca. Escarba su nido en los barrancos de las quebradas con sombra.'],
  turtles: ['Paslama', 'Las tortugas paslama salen a anidar en la playa de la finca. Necesitan arena tranquila, plantas de duna, y ningún sendero ni edificio cerca.'],
  congo: ['Monos congos', 'Vuelven los monos congos. Solo andan por las copas de los árboles, así que el bosque tiene que ser grande y estar unido al bosque del volcán.'],
  lora: ['Lora', 'Las loras nuca amarilla anidan aquí. Necesitan árboles grandes y viejos con huecos.'],
  species12: ['Bienvenidos de vuelta', 'Tené 12 especies de animales viviendo en la finca al mismo tiempo.'],
  species20: ['Una finca viva', 'Tené 20 especies de animales viviendo aquí a la vez.'],
  score: ['Próspera', 'Llegá a 70 de salud del ecosistema.'],
};
// the progress lines, English → Spanish
const PROG = [
  [/^(\d[\d,]*) \/ (\d[\d,]*) planted$/, '$1 / $2 sembrados'],
  [/^(\d[\d,]*) \/ (\d[\d,]*) newly shaded pasture tiles$/, '$1 / $2 cuadros nuevos de potrero con sombra'],
  [/^(\d+) \/ 150 mangroves where the ponds were$/, '$1 / 150 mangles donde estaban las camaroneras'],
  [/^\$([\d,]+) \/ \$1,500 of milk last month$/, '$$$1 / $$1,500 de leche el mes pasado'],
  [/^(\d+)% \/ 50% shaded$/, '$1% / 50% con sombra'],
  [/^(\d[\d,]*) tiles of shrimp pond left$/, 'Quedan $1 cuadros de camaronera'],
  [/^(\d[\d,]*) \/ (\d[\d,]*) tiles$/, '$1 / $2 cuadros'],
  [/^(\d+)% invasive$/, '$1% invasoras'],
  [/^(\d+) turtles here$/, '$1 tortugas aquí'],
  [/^(\d+) howlers here$/, '$1 monos congos aquí'],
  [/^(\d+) parrots here$/, '$1 loras aquí'],
  [/^(\d+) here$/, '$1 aquí'],
  [/^(\d+) \/ (\d+) species$/, '$1 / $2 especies'],
  ['Culvert still in place', 'La alcantarilla sigue ahí'], ['Done', 'Listo'],
  ['No fire yet this dry season', 'Ningún fuego este verano'], ['A fire burned recently', 'Hubo un fuego hace poco'],
];
const trProg = s => { for (const [a, b] of PROG) { if (typeof a === 'string' ? a === s : a.test(s)) return typeof a === 'string' ? b : s.replace(a, b); } return s; };

// ------------------------------------------------------------------ applying it
const M = BIOMES.chinandega;
const on = () => lang === 'es';
// the map picker can show Spanish on an English page (right after someone taps Español), so the
// map's card is in the dictionary as well
addStrings({ [M.blurb]: MAP.blurb, [M.name]: MAP.name });
const GROUPS = { Mammals: 'Mamíferos', Birds: 'Aves', Reptiles: 'Reptiles', Fish: 'Peces', 'The herd': 'El hato' };
// The map's plants and animals are translated as they're built, so everything made from them
// (the plant tools, the guide, the messages that name a species) is in Spanish from the start.
const buildPlants = M.plants, buildAnimals = M.animals;
M.plants = (def, mix, get) => {
  if (!on()) return buildPlants(def, mix, get);
  buildPlants(def, m => { if (MIXES[m.key]) [m.name, m.desc] = MIXES[m.key]; mix(m); }, get);
  for (const [k, [name, desc]] of Object.entries(PLANTS)) { const p = get(k); if (p) Object.assign(p, { name, desc }); }
  applyMap();
};
M.animals = def => {
  if (!on()) return buildAnimals(def);
  const meta = buildAnimals(d => {
    const es = ANIMALS[d.key];
    if (es) Object.assign(d, { name: es[0], desc: es[3], hint: es[4] });
    d.group = GROUPS[d.group] || d.group;
    return def(d);
  });
  for (const [k, v] of Object.entries(ANIMALS)) meta.names[k] = [v[1], v[2]];
  meta.groups = meta.groups.map(g => GROUPS[g] || g);
  return meta;
};
let applied = false;
function applyMap() {
  if (applied) return; applied = true;
  const { seasons, tips, fireCause, moments, toolText, text, ...rest } = MAP;
  Object.assign(M, rest);
  Object.assign(M.text, text);
  Object.assign(M.climate, { seasons, tips, fireCause });
  for (const [k, v] of Object.entries(toolText)) Object.assign(M.toolText[k] ||= {}, v);
  for (const [k, v] of Object.entries(moments)) Object.assign(M.moments[k], v);
  for (const g of M.goals) {
    const es = GOALS[g.key]; if (!es) continue;
    [g.name, g.desc] = es;
    const prog = g.prog; if (prog) g.prog = x => trProg(prog(x));
  }
}
// the campaign chapters are built after the tools; translate them in place, and the shared tools
// too, so their names read in Spanish wherever they turn up (the brush tip, messages)
onBiome(b => {
  if (!on() || b.id !== 'chinandega') return;
  for (const t of [...Object.values(TOOLS), ...CATEGORIES, ...PLANT_TABS]) { t.name = tr(t.name); if (t.desc) t.desc = tr(t.desc); }
  FEATURE_NAMES.forEach((n, k) => { FEATURE_NAMES[k] = tr(n); });
  LAYER_NAMES.forEach((n, k) => { LAYER_NAMES[k] = tr(n); });
  CHAPTERS.forEach((c, k) => {
    const es = CHAPTERS_ES[k]; if (!es) return;
    [c.title, c.story, c.teach] = es;
    c.goals.forEach((g, j) => { if (es[3][j]) g.desc = es[3][j]; });
  });
});
// the short status lines under the campaign goals
addStrings({
  Open: 'Abierta', 'Still blocking the stream': 'Todavía tapa la quebrada', "It's here": 'Ya está aquí', 'Needs shady stream banks and insects': 'Necesita orillas con sombra e insectos',
  "They're here": 'Ya están aquí', 'Needs tidal mudflats where ponds were drained': 'Necesita lodazales de marea donde se vaciaron camaroneras',
  'They came ashore': 'Salieron a la playa', 'They come July to October to a quiet, planted beach': 'Vienen de julio a octubre a una playa tranquila y con plantas',
  'They made it': 'Lo lograron', 'About six weeks after the nesting': 'Unas seis semanas después de la anidada',
  'A baby in the troop': 'Un bebé en la manada', 'Needs big, connected forest (the Wildlife tools can bring a troop)': 'Necesita bosque grande y conectado (las herramientas de Animales pueden traer una manada)',
});
// the finca's monthly earnings message
addPatterns([
  [/^([\d,]+) \/ ([\d,]+) newly shaded tiles · young trees (\d+)% of the way to giving shade$/, '$1 / $2 cuadros nuevos con sombra · los árboles jóvenes van en un $3% del camino para dar sombra'],
  [/^This month the cooperative sold \$([\d,]+) of milk and cheese, and the fishers and cockle gatherers \$([\d,]+) of fish and conchas negras\. Shade trees in the pasture raise the first; mangroves raise the second\.$/,
    'Este mes la cooperativa vendió $$$1 de leche y queso, y los pescadores y las concheras $$$2 de pescado y conchas negras. Los árboles de sombra en el potrero suben lo primero; los manglares suben lo segundo.'],
]);
