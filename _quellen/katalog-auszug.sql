select json_agg(json_build_object(
  'id', r.id, 'hersteller', r.hersteller, 'modell', r.modell, 'reihe', r.reihe, 'baujahr', r.baujahr,
  'kategorie', r.kategorie, 'uvp_eur', r.uvp_eur, 'zweitnamen', r.zweitnamen, 'geaendert', r.geaendert::date,
  'teile', (select json_agg(json_build_object(
      'id', t.id, 'marke', t.marke, 'name', t.name, 'kategorie', t.kategorie, 'merkmale', t.merkmale,
      'preis', t.richtpreis_eur, 'abgeleitet', rt.abgeleitet, 'hinweis', rt.hinweis,
      'alternativen', (select json_agg(json_build_object('marke', a.marke, 'name', a.name, 'preis', a.richtpreis_eur) order by a.richtpreis_eur nulls last)
                       from (select * from teile a where a.passt_key = t.passt_key and a.id <> t.id order by a.richtpreis_eur nulls last limit 3) a)
    ) order by rt.position) from rad_teile rt join teile t on t.id = rt.teil_id where rt.rad_id = r.id)
) order by r.hersteller, r.modell) as daten
from raeder r where r.geprueft;
