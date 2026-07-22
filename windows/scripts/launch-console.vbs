Option Explicit

Dim arguments, shell, command, index
Set arguments = WScript.Arguments

If arguments.Count < 2 Then
  WScript.Quit 2
End If

Set shell = CreateObject("WScript.Shell")
command = QuoteArgument(arguments(0))

For index = 1 To arguments.Count - 1
  command = command & " " & QuoteArgument(arguments(index))
Next

shell.Run command, 0, False

Function QuoteArgument(value)
  QuoteArgument = Chr(34) & Replace(CStr(value), Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
