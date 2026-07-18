#!/bin/bash

supervisor_should_launch_codex() {
  [ "${1:-false}" != "true" ]
}
