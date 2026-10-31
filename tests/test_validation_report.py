from scripts.generate_validation_report import (
    REPORT_PATH,
    SCENARIOS,
    execute_scenario,
    generate_report,
)


def test_generated_report_is_current() -> None:
    assert REPORT_PATH.read_text(encoding="utf-8") == generate_report()


def test_all_scenario_snapshots_keep_unknown_system_characteristics_absent() -> None:
    for definition in SCENARIOS:
        scenario = execute_scenario(definition)
        systems = [
            scenario["initial_state"]["system"],
            *[step["state_after_step"]["system"] for step in scenario["steps"]],
            scenario["final_state"]["system"],
        ]
        assert all(
            system["domain"] == "photovoltaic"
            and system["type"] == "photovoltaic_installation"
            and system["characteristics"] == {}
            for system in systems
        )


def test_scripted_provider_never_mutates_its_input_state() -> None:
    for definition in SCENARIOS:
        scenario = execute_scenario(definition)
        assert all(
            step["provider_input_unchanged"] for step in scenario["steps"]
        )
