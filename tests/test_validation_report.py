from scripts.generate_validation_report import (
    REPORT_PATH,
    SCENARIOS,
    execute_scenario,
    generate_report,
)


def test_generated_report_is_current() -> None:
    assert REPORT_PATH.read_text(encoding="utf-8") == generate_report()


def test_all_scenario_snapshots_keep_unknown_installation_values_null() -> None:
    for definition in SCENARIOS:
        scenario = execute_scenario(definition)
        installations = [
            scenario["initial_state"]["installation"],
            *[
                step["state_after_step"]["installation"]
                for step in scenario["steps"]
            ],
            scenario["final_state"]["installation"],
        ]
        assert all(
            all(value is None for value in installation.values())
            for installation in installations
        )


def test_scripted_provider_never_mutates_its_input_state() -> None:
    for definition in SCENARIOS:
        scenario = execute_scenario(definition)
        assert all(
            step["provider_input_unchanged"] for step in scenario["steps"]
        )
