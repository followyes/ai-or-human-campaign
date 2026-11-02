# AI or Human — Campaign

Nowa, niezależna wersja przeglądarkowej gry AI vs Human. Bazuje na kodzie wcześniejszej gry, lecz działa w oddzielnym repozytorium i docelowo w oddzielnym projekcie Supabase.

## Status

**Prototyp kampanii v0.2 (bez Supabase).** Oryginalne tryby Classic i Speed Run oraz panel admina znajdują się w kodzie, ale połączenie z bazą jest celowo odłączone. Nowy tryb **Kampania** dostępny jest pod `campaign.html` (lub przez przycisk Kampania w `index.html`). Zawiera 5 poziomów po 5 oznaczonych kart demonstracyjnych, bossa (10 kart), 3 serca i regenerację 10 min. Wszystkie grafiki są **fikcyjnymi, jawnie oznaczonymi placeholderami**, nie fotografiami; odpowiedzi służą wyłącznie do testowania mechaniki. Aktualny limit bossa 60 s jest wartością testową, nie zatwierdzoną decyzją.

## Uruchomienie i testy

Wymagany Node.js (testowano z Node 22; oryginalny workflow używał Node 24). Nie są wymagane zależności npm.

```bash
npm test
npm run build
```

Aby zobaczyć interfejs, uruchom lokalny serwer HTTP w folderze repozytorium (np. rozszerzeniem Live Server w VS Code). Otwieranie `index.html` poprzez `file://` może blokować moduły JS. Kampania działa bez Supabase na lokalnych zasobach. **Stare tryby Classic i Speed Run nie działają bez osobnego Supabase.** Do podglądu gry kampanijnej można otworzyć `campaign.html` przez lokalny serwer HTTP.

## Osobny Supabase — potrzebny dopiero do wersji produkcyjnej

1. Utwórz NOWY projekt Supabase, niezależny od tego używanego przez oryginalną grę.
2. Nie kopiuj produkcyjnego URL/klucza z oryginalnej wersji. `js/supabase-config.js` zawiera celowo puste pola.
3. Nie dodawaj tajnych kluczy `service_role`, `sb_secret_*`, haseł ani prywatnych tokenów do plików publicznych.
4. Najpierw przygotujemy schemat bazy / polityki RLS i nowy katalog zdjęć. Dopiero później podłączymy publiczny URL i `sb_publishable_*`. Obecna kampania nie wykonuje połączeń z Supabase.
5. Kod zawiera dodatkową blokadę adresu projektu bazy oryginalnej gry.

## Wdrożenie

Automatyczny workflow GitHub Pages **nie został przeniesiony** do tej kopii startowej. Włączymy publikację dopiero po skonfigurowaniu nowej bazy i przetestowaniu gry. Samo wgranie kodu do nowego repozytorium nie publikuje gry.

## Dokumentacja i historia

Pełna dokumentacja projektu (AGENTS.md, ROADMAP.md, CHANGELOG.md, CONTINUE_IN_NEW_CHAT.md, QA_CURRENT.md, README_FIRST.txt) jest trzymana **poza repozytorium** w osobnym ZIP-ie. Szczegółową historię zmian zapisujemy tylko w zewnętrznym `CHANGELOG.md`.

## Ograniczenia prototypu

- Zapisy w `localStorage` są lokalne dla przeglądarki i nieodporne na manipulacje; nie używać do produkcyjnej rywalizacji/rankingu.
- Karty SVG to oznaczone dane demonstracyjne, **nie autentyczne zdjęcia** i nie nadają się na finalną pulę.
- W obecnym demo po błędnej odpowiedzi gracz traci serce i może ponawiać **tę samą kartę**; po wyczerpaniu serc powtarza cały poziom. To zachowanie do zatwierdzenia w docelowej mechanice.
- Boss ma testowy limit 60 sekund; przekroczenie odejmuje 1 serce i kończy próbę.
- Wyjście z rozgrywki na mapę w połowie poziomu porzuca tę próbę; ukończone poziomy i serca pozostają zapisane.
- Pierwsze testy automatyczne nie zastępują testów ręcznych w przeglądarce.
