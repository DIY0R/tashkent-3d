/**
 * OpenStreetMap buildings that stand inside a modelled landmark but carry no `lm` tag in the tile
 * data, so they were extruded on top of the model (doubled minarets, a drum inside a colonnade,
 * a block filling a courtyard). Building id -> landmark id. Like `lm` buildings they are not drawn
 * when that landmark has a model; their footprint still blocks the player.
 * Imported by the tile worker and the street-detail worker (keep it free of other imports).
 */
export const HIDDEN_OSM: ReadonlyMap<number, string> = new Map([
  [1334917067, 'minor-mosque'], // two 40 m "shed" minarets beside the model's own minarets
  [1334917068, 'minor-mosque'],
  [253775296, 'shahidlar-xotirasi'], // 12 m drum inside the colonnade
  [-17805658, 'kukeldash-madrasah'], // 9 m block filling the courtyard
])
