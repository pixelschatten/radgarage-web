#!/usr/bin/env python3
"""Prüft den Prüfwert (sha256) des Design-Skripts in den Schutzregeln der Werkbank (werkbank/index.html, Revision 31.10.2026).

Ändert jemand das kleine <script> oben in der Werkbank, blockiert der Browser es, bis der Wert in der
Content-Security-Policy stimmt. Aufruf: python3 _quellen/csp_pruefen.py         (prüfen, Fehlercode 1 bei Abweichung)
                                     python3 _quellen/csp_pruefen.py --fix   (Wert neu eintragen)
"""
import base64
import hashlib
import os
import re
import sys

PFAD = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'werkbank', 'index.html')


def main():
    text = open(PFAD, encoding='utf-8').read()
    skripte = re.findall(r'<script>(.*?)</script>', text, re.S)
    soll = ["'sha256-%s'" % base64.b64encode(hashlib.sha256(s.encode('utf-8')).digest()).decode() for s in skripte]
    ist = re.findall(r"'sha256-[A-Za-z0-9+/=]+'", text)
    if sorted(soll) == sorted(ist):
        print('Schutzregeln der Werkbank stimmen.')
        return 0
    if '--fix' in sys.argv:
        neu = re.sub(r"script-src 'self'( 'sha256-[A-Za-z0-9+/=]+')*", "script-src 'self' " + ' '.join(soll), text, count=1)
        open(PFAD, 'w', encoding='utf-8').write(neu)
        print('Prüfwert neu eingetragen.')
        return 0
    print('Prüfwert passt nicht zum Skript in werkbank/index.html: python3 _quellen/csp_pruefen.py --fix')
    return 1


if __name__ == '__main__':
    sys.exit(main())
