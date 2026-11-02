# AI or Human — Campaign

Nowa, niezależna wersja przeglądarkowej gry AI vs Human. Bazuje na kodzie wcześniejszej gry, lecz działa w oddzielnym repozytorium i docelowo w oddzielnym projekcie Supabase.

## Status

**Prototyp kampanii v0.4.2 (Supabase opcjonalny).** Oryginalne tryby Classic i Speed Run oraz panel admina znajdują się w kodzie, ale połączenie z bazą jest celowo odłączone. Nowy tryb **Kampania** dostępny jest pod `index.html` w katalogu głównym oraz pod `campaign.html` (lub przez przycisk Kampania w `classic.html`). Zawiera 5 poziomów po 5 oznaczonych kart demonstracyjnych, bossa (10 kart), 3 serca i regenerację 3 min. Wszystkie grafiki są **fikcyjnymi, jawnie oznaczonymi placeholderami**, nie fotografiami; odpowiedzi służą wyłącznie do testowania mechaniki. Aktualny limit bossa 60 s jest wartością testową, nie zatwierdzoną decyzją.

## Uruchomienie i testy

Wymagany Node.js (testowano z Node 22; oryginalny workflow używał Node 24). Nie są wymagane zależności npm.

```bash
npm test
npm run build
```

Aby zobaczyć interfejs, uruchom lokalny serwer HTTP w folderze repozytorium (np. rozszerzeniem Live Server w VS Code). Otwieranie `index.html` poprzez `file://` może blokować moduły JS. Kampania działa bez Supabase na lokalnych zasobach. **Starsze tryby Classic i Speed Run są ukryte w publicznym menu i nie są testowane jako część kampanii.** Do podglądu gry kampanijnej można otworzyć `campaign.html` przez lokalny serwer HTTP.

## Osobny Supabase — odczyt zdjęć kampanii

1. Utwórz NOWY projekt Supabase, niezależny od tego używanego przez oryginalną grę.
2. Nie kopiuj produkcyjnego URL/klucza z oryginalnej wersji. `js/supabase-config.js` zawiera celowo puste pola.
3. Nie dodawaj tajnych kluczy `service_role`, `sb_secret_*`, haseł ani prywatnych tokenów do plików publicznych.
4. Utwórz schemat read-only według `SUPABASE_SQL/01_campaign.sql` z paczki aktualizacji (ten plik nie jest publikowany w repo).
5. Po konfiguracji `projectUrl` i `publishableKey` w `js/supabase-config.js` kampania odczytuje publiczne przypisania. Dopóki nie ma **35 aktywnych obrazów (5×5 + 10)**, pokazuje wyraźny status oraz bezpiecznie pozostaje w DEMO.
6. Postęp prawdziwej kampanii nadal jest lokalny, ale oddzielony od postępu wersji DEMO. Produkcyjny zapis postępu wymaga autoryzacji / serwera i jest kolejnym etapem.
5. Kod zawiera dodatkową blokadę adresu projektu bazy oryginalnej gry.

## Wdrożenie

Strona statyczna: GitHub → Settings → Pages → Deploy from a branch → `main` → `/(root)` → Save. Kampania: `/ai-or-human-campaign/` (również `/ai-or-human-campaign/campaign.html`). Można ją wdrożyć także w DEMO przed uzupełnieniem nowej bazy. Dodatkowy ekran wejściowy pod `/ai-or-human-campaign/classic.html` pokazuje wyłącznie przycisk Kampania. Classic i Speed Run są ukryte w interfejsie; ich kod pozostaje w projekcie tymczasowo. Tło jest placeholderem CSS. Kod i dane publiczne są widoczne w przeglądarce; nie umieszczać sekretów.

## Dokumentacja i historia

Pełna dokumentacja projektu (AGENTS.md, ROADMAP.md, CHANGELOG.md, CONTINUE_IN_NEW_CHAT.md, QA_CURRENT.md, README_FIRST.txt) jest trzymana **poza repozytorium** w osobnym ZIP-ie. Szczegółową historię zmian zapisujemy tylko w zewnętrznym `CHANGELOG.md`.

## Ograniczenia prototypu

- Zapisy w `localStorage` są lokalne dla przeglądarki i nieodporne na manipulacje; nie używać do produkcyjnej rywalizacji/rankingu.
- Karty SVG to oznaczone dane demonstracyjne, **nie autentyczne zdjęcia** i nie nadają się na finalną pulę.
- Każda błędna odpowiedź odbiera jedno serce i od razu kończy próbę. Następne podejście rozpoczyna ten sam poziom od pierwszej karty, z przetasowaną kolejnością; ukończone poziomy nie są cofane. Gdy serca spadną do zera, trzeba poczekać na regenerację (3 minuty na serce).
- Boss ma testowy limit 60 sekund; przekroczenie odejmuje 1 serce i kończy próbę.
- Wyjście z rozgrywki na mapę w połowie poziomu porzuca tę próbę; ukończone poziomy i serca pozostają zapisane.
- Interfejs kampanii jest dopasowany do jednego ekranu (bez przewijania na typowych rozdzielczościach PC i smartfonów). Przed produkcją sprawdzić także powiększenie przeglądarki i urządzenia docelowe.
- Testy automatyczne i test w przeglądarce w trybie demonstracyjnym nie zastępują testów na docelowych urządzeniach.
