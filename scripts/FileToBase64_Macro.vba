Attribute VB_Name = "Module_Base64Converter"
' ==========================================================
' Base64 Vault - VBA Extension
' 功能：將同資料夾下的所有檔案轉換為 Base64 並儲存為 .txt
' ==========================================================

Sub BatchConvertFilesToBase64()
    Dim fso As Object
    Dim folderPath As String
    Dim file As Object
    Dim fileName As String
    Dim fileExt As String
    Dim base64String As String
    Dim txtFilePath As String
    Dim currentExcelName As String
    
    ' 初始化 FileSystemObject
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    ' 獲取當前活頁簿所在的資料夾路徑
    folderPath = ThisWorkbook.Path & "\"
    currentExcelName = ThisWorkbook.Name
    
    Debug.Print "--- Starting Batch Conversion in: " & folderPath & " ---"
    
    ' 遍歷資料夾中的所有檔案
    For Each file In fso.GetFolder(folderPath).Files
        fileName = file.Name
        fileExt = fso.GetExtensionName(fileName)
        
        ' 排除 Excel 程式檔案本身以及已經是 .txt 的檔案
        If fileName <> currentExcelName And LCase(fileExt) <> "txt" And LCase(fileExt) <> "xlsm" Then
            
            Debug.Print "Converting: " & fileName
            
            ' 1. 將檔案轉換為 Base64 字串
            base64String = EncodeFileToBase64(file.Path)
            
            ' 2. 設定輸出的 .txt 檔案路徑
            txtFilePath = folderPath & fileName & ".txt"
            
            ' 3. 將字串寫入文字檔
            SaveAsTextFile txtFilePath, base64String
            
        End If
    Next file
    
    MsgBox "轉換完成！" & vbCrLf & "所有檔案已生成對應的 .txt 檔案。", vbInformation, "Base64 Vault"
End Sub

' --- 工具函數：將二進位檔案轉為 Base64 ---
Function EncodeFileToBase64(ByVal strFilePath As String) As String
    Dim domDoc As Object
    Dim xmlNode As Object
    Dim binaryData() As Byte
    Dim fileNum As Integer
    
    ' 讀取檔案的二進位內容
    fileNum = FreeFile
    Open strFilePath For Binary Access Read As #fileNum
    ReDim binaryData(LOF(fileNum) - 1)
    Get #fileNum, , binaryData
    Close #fileNum
    
    ' 利用 MSXML2.DOMDocument 進行編碼
    Set domDoc = CreateObject("MSXML2.DOMDocument.6.0")
    Set xmlNode = domDoc.createElement("b64")
    
    xmlNode.DataType = "bin.base64"
    xmlNode.nodeTypedValue = binaryData
    
    EncodeFileToBase64 = xmlNode.Text
End Function

' --- 工具函數：儲存文字檔 ---
Sub SaveAsTextFile(strPath As String, strContent As String)
    Dim fso As Object
    Dim txtStream As Object
    
    Set fso = CreateObject("Scripting.FileSystemObject")
    Set txtStream = fso.CreateTextFile(strPath, True)
    txtStream.Write strContent
    txtStream.Close
End Sub
