select json_agg(json_build_object('id', t.id, 'marke', t.marke, 'name', t.name, 'kategorie', t.kategorie,
  'passt_key', t.passt_key, 'merkmale', t.merkmale, 'preis', t.richtpreis_eur, 'schaetzung', t.richtpreis_ist_schaetzung) order by t.id) as daten
from teile t where t.geprueft;
