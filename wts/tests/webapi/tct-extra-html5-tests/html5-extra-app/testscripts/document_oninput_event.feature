Feature: dom
 Scenario: document oninput event
  When launch "html5-extra-app"
   And I go to "dom/document_oninput_event-manual.html"
  When I fill in "test_textarea" with "a"
  Then I should see "PASS" in "test" area
