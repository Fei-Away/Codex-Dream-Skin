on requiredArgument(argumentList, argumentIndex, argumentName)
  if (count of argumentList) < argumentIndex then
    error "Missing " & argumentName number 64
  end if
  return item argumentIndex of argumentList as text
end requiredArgument

on run argv
  set commandName to my requiredArgument(argv, 1, "command")

  if commandName is "notify" then
    set messageText to my requiredArgument(argv, 2, "message")
    display notification messageText with title "Codex Dream Skin"
    return ""
  else if commandName is "alert" then
    set messageText to my requiredArgument(argv, 2, "message")
    display alert "Codex Dream Skin" message messageText
    return ""
  else if commandName is "confirm" then
    set messageText to my requiredArgument(argv, 2, "message")
    set okLabel to my requiredArgument(argv, 3, "confirmation label")
    display dialog messageText buttons {"取消", okLabel} default button okLabel with title "Codex Dream Skin"
    return ""
  else if commandName is "echo-args" then
    set firstValue to my requiredArgument(argv, 2, "first value")
    set secondValue to my requiredArgument(argv, 3, "second value")
    return firstValue & linefeed & secondValue
  end if

  error "Unknown command: " & commandName number 64
end run
