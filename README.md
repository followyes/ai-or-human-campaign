# AI or Human — Campaign

Nowa, niezależna wersja przeglądarkowej gry AI vs Human. Bazuje na kodzie wcześniejszej gry, lecz działa w oddzielnym repozytorium i docelowo w oddzielnym projekcie Supabase.

## Status

**Campaign v0.9.1 — dynamiczna kampania, konta graczy i ranking beta.**
Po ukończeniu poziomu gracz automatycznie wraca do mapy. Mapa ma jedną pionową ścieżkę z rombowymi oznaczeniami etapów; ukończone etapy mają znacznik ✓ i informacje o możliwości powtórzenia na tabliczce; na telefonie przewija się palcem, a na PC kółkiem albo przeciągając myszką. Pierwsze ukończenie etapu odblokowuje następny romb: mapa przewija się do niego, kłódka drży i zmienia się w numer. Ponowne zaliczenie etapu podświetla istniejący znacznik, bez fałszywego odblokowywania. W trybie ograniczonego ruchu efekt jest spokojniejszy. AI oznaczamy kolorem niebieskim, Human magenta, a zielony/czerwony informują wyłącznie o poprawnej/błędnej odpowiedzi.
Menu główne (`index.html`) zawiera tylko przycisk **Kampania**, który otwiera `campaign.html`.
Panel administracyjny działa pod `/admin/` z Supabase Auth.
Pięć zwykłych poziomów (po 5 zdjęć) i boss (10 zdjęć) tworzą powtarzalny cykl.
Gdy administrator doda odpowiednią liczbę nowych zdjęć, Supabase automatycznie tworzy
kolejny etap. Usunięcie zdjęcia z etapu powoduje usunięcie etapu, oddanie pozostałych
zdjęć do kolejki i automatyczną zmianę wyświetlanej numeracji.

**Wymagany jednorazowy skrypt migracji:** `SUPABASE_SQL/06_automatyczne_poziomy.sql`
w paczce aktualizacji ZIP (skrypt przechowywany poza repo). Bez uruchomienia tego skryptu
aktualizacja zachowuje możliwość odczytu sześciu starych etapów.

## Uruchomienie i testy

Wymagany Node.js (testowano z Node 22; oryginalny workflow używał Node 24). Nie są wymagane zależności npm.

```bash
npm test
npm run build
```

Aby zobaczyć interfejs, uruchom lokalny serwer HTTP w folderze repozytorium (np. rozszerzeniem Live Server w VS Code). Otwieranie `index.html` poprzez `file://` może blokować moduły JS. Kampania działa bez Supabase na lokalnych zasobach. **Starsze tryby Classic i Speed Run są ukryte w publicznym menu i nie są testowane jako część kampanii.** Po otwarciu `index.html` w lokalnym serwerze pojawia się ekran powitalny; przycisk „Kampania” otwiera `campaign.html`.

## Osobny Supabase — dynamiczne etapy

- Baza musi być **oddzielnym** projektem `ai-or-human-campaign`. Nie dotykamy starej gry.
- `js/supabase-config.js` zawiera publiczny URL i klucz `sb_publishable_`, które **nie są dołączane do ZIP-ów**.
- Przed migracją v0.6.0 wykonaj kopię danych tabel kampanii i biblioteki.
- W nowym SQL Editor uruchom **06_automatyczne_poziomy.sql** dopiero po opublikowaniu kodu v0.6.0.
- Migracja przenosi dotychczasowe 35 kart do nowych tabel `campaign_stages` i `campaign_stage_cards` z trwałymi ID; wyłącza stare aktywne przypisania, ale nie kasuje plików.
- Kolejne wgrania zdjęć przez panel `admin/` są liczone w `campaign_photo_queue`. Już istniejących 130 niezwiązanych z kampanią zdjęć nie dodajemy automatycznie.
- Odpowiedzi i ścieżki aktywnych kart są publicznie odczytywane z widoku `campaign_public_cards`; queue i biblioteka panelu są chronione RLS.
- W panelu można usunąć lub przenieść używane zdjęcie po potwierdzeniu konsekwencji: cały etap zostaje usunięty, a pozostałe zdjęcia wracają do kolejki.
- Uwaga: usuwanie plików Storage i zmiany w PostgreSQL nie są pojedynczą transakcją; przed pracą na prawdziwych zdjęciach przetestuj ten scenariusz na plikach testowych.
- Gość zapisuje postęp lokalnie; zalogowany gracz korzysta z Supabase Auth i synchronizowanego postępu/serc.

## Wdrożenie

Strona statyczna: GitHub → Settings → Pages → Deploy from a branch → `main` → `/(root)` → Save. Menu startowe: `/ai-or-human-campaign/`; mapa i gra: `/ai-or-human-campaign/campaign.html`. Można ją wdrożyć także w DEMO przed uzupełnieniem nowej bazy. Adres `/ai-or-human-campaign/classic.html` zachowuje ten sam ekran startowy co adres główny. Classic i Speed Run są ukryte w interfejsie; ich kod pozostaje w projekcie tymczasowo. Tło jest placeholderem CSS. Kod i dane publiczne są widoczne w przeglądarce; nie umieszczać sekretów.

## Dokumentacja i historia

Pełna dokumentacja projektu (AGENTS.md, ROADMAP.md, CHANGELOG.md, CONTINUE_IN_NEW_CHAT.md, QA_CURRENT.md, README_FIRST.txt) jest trzymana **poza repozytorium** w osobnym ZIP-ie. Szczegółową historię zmian zapisujemy tylko w zewnętrznym `CHANGELOG.md`.

## Ograniczenia prototypu

- Zapisy w `localStorage` są lokalne dla przeglądarki i nieodporne na manipulacje; nie używać do produkcyjnej rywalizacji/rankingu.
- Karty SVG to oznaczone dane demonstracyjne, **nie autentyczne zdjęcia** i nie nadają się na finalną pulę.
- Każda błędna odpowiedź odbiera jedno serce i od razu kończy próbę. Następne podejście rozpoczyna ten sam poziom od pierwszej karty, z przetasowaną kolejnością; ukończone poziomy nie są cofane. Gdy serca spadną do zera, trzeba poczekać na regenerację (3 minuty na serce).
- Boss ma testowy limit 60 sekund; przekroczenie odejmuje 1 serce i kończy próbę.
- Wyjście z rozgrywki na mapę w połowie poziomu porzuca tę próbę; ukończone poziomy i serca pozostają zapisane.
- Interfejs gry mieści się na jednym ekranie, a ciągła mapa poziomów przewija się wewnątrz panelu (nie przewija się cała strona). Przed produkcją sprawdzić także powiększenie przeglądarki i urządzenia docelowe.
- Testy automatyczne i test w przeglądarce w trybie demonstracyjnym nie zastępują testów na docelowych urządzeniach.


## Panel administratora

Panel jest dostępny pod `/admin/` w obrębie nowej domeny GitHub Pages.
Korzysta wyłącznie z nowego projektu Supabase skonfigurowanego w `js/supabase-config.js`.
Przed pierwszym logowaniem administrator musi uruchomić instrukcję SQL dostarczoną
oddzielnie (poza repozytorium) i przypisać rolę do konta Supabase Auth.
W zakładce „Wyniki” panelu widoczne są punktowane, zweryfikowane przez serwer ukończone próby kampanii i Challenge (ranking beta). Starsze tryby Classic/Speed Run mają osobne archiwum.
Dla gości postęp nadal pozostaje lokalny. Wyniki sprzed v0.9.1 nie są automatycznie uwzględniane w rankingu.
Ważne: publiczne metadane i ścieżki Storage ujawniają klasy zdjęć — pełny anty-cheat wymaga ich ukrycia w przyszłości.

## Ranking beta (bieżąca architektura)

Nowy skrypt `SUPABASE_SQL/12_rankingi_v091.sql` instaluje prywatne tabelki sesji/kart oraz serwerowe RPC do naliczania punktów za każdą poprawną odpowiedź. Dla każdego trwałego identyfikatora poziomu wyświetlane jest najlepsze *potwierdzone* ukończenie danego gracza. Niedokończone i stare niezweryfikowane próby nie uczestniczą w rankingach. W głównym interfejsie przycisk „Aktualny” umożliwia powrót do pierwszego nieukończonego poziomu mapy.
