# AI or Human — Campaign

Nowa, niezależna wersja przeglądarkowej gry AI vs Human. Bazuje na kodzie wcześniejszej gry, lecz działa w oddzielnym repozytorium i docelowo w oddzielnym projekcie Supabase.

## Status

**Bezpieczna kopia startowa (bootstrap).** Oryginalne tryby Classic i Speed Run oraz panel admina znajdują się w kodzie, ale połączenie z bazą jest celowo odłączone. Kampania (5 poziomów po 5 zdjęć, serca i boss) **nie jest jeszcze zaimplementowana**. Nie jest to gotowa grywalna wersja nowej kampanii.

## Uruchomienie i testy

Wymagany Node.js (testowano z Node 22; oryginalny workflow używał Node 24). Nie są wymagane zależności npm.

```bash
npm test
npm run build
```

Aby zobaczyć interfejs, uruchom lokalny serwer HTTP w folderze repozytorium (np. rozszerzeniem Live Server w VS Code). Otwieranie `index.html` poprzez `file://` może blokować moduły JS. Dopóki nie skonfigurujemy osobnego Supabase, nie będzie można pobierać zdjęć ani rozgrywać sesji.

## Osobny Supabase — obowiązkowe przed grą

1. Utwórz NOWY projekt Supabase, niezależny od tego używanego przez oryginalną grę.
2. Nie kopiuj produkcyjnego URL/klucza z oryginalnej wersji. `js/supabase-config.js` zawiera celowo puste pola.
3. Nie dodawaj tajnych kluczy `service_role`, `sb_secret_*`, haseł ani prywatnych tokenów do plików publicznych.
4. Najpierw przygotujemy schemat bazy / polityki RLS i nowy katalog zdjęć. Dopiero później podłączymy publiczny URL i `sb_publishable_*`.
5. Kod zawiera dodatkową blokadę adresu projektu bazy oryginalnej gry.

## Wdrożenie

Automatyczny workflow GitHub Pages **nie został przeniesiony** do tej kopii startowej. Włączymy publikację dopiero po skonfigurowaniu nowej bazy i przetestowaniu gry. Samo wgranie kodu do nowego repozytorium nie publikuje gry.

## Dokumentacja i historia

Pełna dokumentacja projektu (AGENTS.md, ROADMAP.md, CHANGELOG.md, CONTINUE_IN_NEW_CHAT.md, QA_CURRENT.md, README_FIRST.txt) jest trzymana **poza repozytorium** w osobnym ZIP-ie. Szczegółową historię zmian zapisujemy tylko w zewnętrznym `CHANGELOG.md`.
